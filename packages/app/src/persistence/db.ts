/**
 * IndexedDB persistence: latest campaign per id, versioned snapshots for rollback,
 * cached voice/art assets, and the generation log. All local to the DM's device.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { migrateCampaign, safeParseCampaign, type Campaign } from "@cardinal/core";
import type { AssetBlob, AssetCache, GenerationLogEntry, GenerationLogSink } from "@cardinal/ai";

interface CardinalDB extends DBSchema {
  campaigns: { key: string; value: { id: string; name: string; updatedAt: string; data: Campaign } };
  snapshots: {
    key: number;
    value: { id?: number; campaignId: string; at: string; schemaVersion: number; label: string; data: Campaign };
    indexes: { byCampaign: string };
  };
  assets: { key: string; value: { key: string; blob: AssetBlob } };
  genlog: { key: string; value: GenerationLogEntry; indexes: { byAt: string } };
}

const DB_NAME = "cardinal";
const DB_VERSION = 1;
let dbPromise: Promise<IDBPDatabase<CardinalDB>> | null = null;

export function db(): Promise<IDBPDatabase<CardinalDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CardinalDB>(DB_NAME, DB_VERSION, {
      upgrade(d) {
        d.createObjectStore("campaigns", { keyPath: "id" });
        const snaps = d.createObjectStore("snapshots", { keyPath: "id", autoIncrement: true });
        snaps.createIndex("byCampaign", "campaignId");
        d.createObjectStore("assets", { keyPath: "key" });
        const log = d.createObjectStore("genlog", { keyPath: "id" });
        log.createIndex("byAt", "at");
      },
    });
  }
  return dbPromise;
}

export async function listCampaigns(): Promise<{ id: string; name: string; updatedAt: string }[]> {
  const d = await db();
  const all = await d.getAll("campaigns");
  return all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadCampaign(id: string): Promise<{ campaign: Campaign; migrated: string[] } | null> {
  const d = await db();
  const row = await d.get("campaigns", id);
  if (!row) return null;
  const r = migrateCampaign(row.data);
  return { campaign: r.campaign, migrated: r.appliedSteps };
}

export async function saveCampaign(campaign: Campaign): Promise<void> {
  const d = await db();
  await d.put("campaigns", { id: campaign.id, name: campaign.name, updatedAt: campaign.updatedAt, data: campaign });
}

export async function deleteCampaign(id: string): Promise<void> {
  const d = await db();
  await d.delete("campaigns", id);
  const tx = d.transaction("snapshots", "readwrite");
  for (const key of await tx.store.index("byCampaign").getAllKeys(id)) await tx.store.delete(key);
  await tx.done;
}

const MAX_SNAPSHOTS_PER_CAMPAIGN = 40;

export async function saveSnapshot(campaign: Campaign, label: string): Promise<void> {
  const d = await db();
  await d.add("snapshots", { campaignId: campaign.id, at: new Date().toISOString(), schemaVersion: campaign.schemaVersion, label, data: campaign });
  const keys = await d.getAllKeysFromIndex("snapshots", "byCampaign", campaign.id);
  if (keys.length > MAX_SNAPSHOTS_PER_CAMPAIGN) {
    const tx = d.transaction("snapshots", "readwrite");
    for (const k of keys.slice(0, keys.length - MAX_SNAPSHOTS_PER_CAMPAIGN)) await tx.store.delete(k);
    await tx.done;
  }
}

export async function listSnapshots(campaignId: string): Promise<{ id: number; at: string; label: string; schemaVersion: number }[]> {
  const d = await db();
  const rows = await d.getAllFromIndex("snapshots", "byCampaign", campaignId);
  return rows.map((r) => ({ id: r.id as number, at: r.at, label: r.label, schemaVersion: r.schemaVersion })).reverse();
}

export async function loadSnapshot(id: number): Promise<Campaign | null> {
  const d = await db();
  const row = await d.get("snapshots", id);
  return row ? migrateCampaign(row.data).campaign : null;
}

export function exportCampaignJson(campaign: Campaign): string {
  return JSON.stringify(campaign, null, 2);
}

export function importCampaignJson(text: string): { ok: true; campaign: Campaign; migrated: string[] } | { ok: false; error: string } {
  try {
    const raw = JSON.parse(text) as unknown;
    const r = migrateCampaign(raw);
    const check = safeParseCampaign(r.campaign);
    if (!check.ok) return { ok: false, error: check.error };
    return { ok: true, campaign: r.campaign, migrated: r.appliedSteps };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export class IdbAssetCache implements AssetCache {
  async get(key: string) {
    return (await (await db()).get("assets", key))?.blob;
  }
  async put(key: string, blob: AssetBlob) {
    await (await db()).put("assets", { key, blob });
  }
  async delete(key: string) {
    await (await db()).delete("assets", key);
  }
  async keys() {
    return (await (await db()).getAllKeys("assets")) as string[];
  }
}

export class IdbGenerationLogSink implements GenerationLogSink {
  async append(entry: GenerationLogEntry) {
    const d = await db();
    await d.put("genlog", entry);
    const keys = await d.getAllKeysFromIndex("genlog", "byAt");
    if (keys.length > 500) {
      const tx = d.transaction("genlog", "readwrite");
      for (const k of keys.slice(0, keys.length - 500)) await tx.store.delete(k);
      await tx.done;
    }
  }
}

export async function loadPersistedLog(limit = 100): Promise<GenerationLogEntry[]> {
  const d = await db();
  const all = await d.getAllFromIndex("genlog", "byAt");
  return all.slice(-limit).reverse();
}
