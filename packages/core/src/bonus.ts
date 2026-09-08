/** Bonus prep-side features, gated by feature flags in the UI: timeline, faction map, loot log. */
import type { Campaign } from "./schema.js";

export interface TimelineEntry {
  sessionNumber: number;
  at: string;
  kind: string;
  text: string;
  secret: boolean;
}

export function buildTimeline(campaign: Campaign, opts: { includeSecret?: boolean } = {}): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const s of [...campaign.sessions].sort((a, b) => a.number - b.number))
    for (const e of s.events) if (opts.includeSecret || !e.secret) out.push({ sessionNumber: s.number, at: e.at, kind: e.kind, text: e.text, secret: e.secret });
  return out;
}

export interface FactionMapEdge {
  from: string;
  to: string;
  stance: string;
  note: string;
}

export interface FactionMap {
  nodes: { id: string; name: string; reputation: number; secret: boolean }[];
  edges: FactionMapEdge[];
}

export function buildFactionMap(campaign: Campaign): FactionMap {
  return {
    nodes: campaign.world.factions.map((f) => ({ id: f.id, name: f.name, reputation: f.reputation, secret: f.secret })),
    edges: campaign.world.factions.flatMap((f) => f.relationships.map((r) => ({ from: f.id, to: r.factionId, stance: r.stance, note: r.note }))),
  };
}

export interface LootLogEntry {
  sessionNumber: number;
  at: string;
  text: string;
  pcIds: string[];
}

export function buildLootLog(campaign: Campaign): LootLogEntry[] {
  return campaign.sessions
    .flatMap((s) => s.events.filter((e) => e.kind === "transaction" || e.tags.includes("loot")).map((e) => ({ sessionNumber: s.number, at: e.at, text: e.text, pcIds: e.pcIds })))
    .sort((a, b) => a.at.localeCompare(b.at));
}

export function isFeatureEnabled(campaign: Campaign, flag: string): boolean {
  return campaign.featureFlags[flag] === true;
}
