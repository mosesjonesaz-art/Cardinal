/**
 * The single reducer through which campaign state changes. Every action is a
 * plain object so the UI, the AI layer and tests all mutate state the same way.
 *
 * Principle 3: quick-edit actions record an OverrideRecord so the value becomes
 * documented ground truth. Principle 5: nothing here is called by the AI layer
 * without the DM having tapped "apply".
 */
import { newId } from "./ids.js";
import { getAtPath, setAtPath } from "./paths.js";
import {
  CampaignSchema,
  type Campaign,
  type Consequence,
  type Encounter,
  type Faction,
  type Location,
  type Npc,
  type NpcMemory,
  type NpcMood,
  type PlayerCharacter,
  type PlotThread,
  type Session,
  type SessionEvent,
  type Shop,
  type StatBlock,
  type Fact,
  type Item,
} from "./schema.js";

export interface ReducerContext {
  now: () => string;
  id: (prefix?: string) => string;
}

export const defaultContext: ReducerContext = {
  now: () => new Date().toISOString(),
  id: (prefix) => newId(prefix),
};

type Upsert<T> = T;
/** Input shapes: required essentials, everything else optional (defaults applied by the reducer). */
export type EventInput = Pick<SessionEvent, "kind" | "text"> & Partial<Omit<SessionEvent, "kind" | "text">>;
export type ConsequenceInput = Pick<Consequence, "description"> & Partial<Omit<Consequence, "description">>;
export type MemoryInput = Pick<NpcMemory, "summary"> & Partial<Omit<NpcMemory, "summary">>;

export type CampaignAction =
  // --- Overrides (Principle 3) ---
  | { type: "override"; path: string; value: unknown; reason?: string }
  | { type: "setPcHp"; pcId: string; value: number; reason?: string }
  | { type: "adjustPcHp"; pcId: string; delta: number; reason?: string }
  | { type: "setPcTempHp"; pcId: string; value: number }
  | { type: "adjustGold"; target: { pcId: string } | { shared: true }; delta: number; reason?: string }
  | { type: "setGold"; target: { pcId: string } | { shared: true }; value: number; reason?: string }
  | { type: "setPcXp"; pcId: string; value: number; reason?: string }
  | { type: "awardXp"; amount: number; pcIds?: string[]; reason?: string }
  | { type: "setPcLevel"; pcId: string; value: number; reason?: string }
  | { type: "setFlag"; key: string; value: boolean | number | string; reason?: string }
  | { type: "adjustReputation"; factionId: string; delta: number; reason?: string }
  | { type: "setReputation"; factionId: string; value: number; reason?: string }
  | { type: "useSpellSlot"; pcId: string; level: number; delta?: number }
  | { type: "useResource"; pcId: string; name: string; delta?: number }
  | { type: "rest"; kind: "short" | "long"; pcIds?: string[] }
  | { type: "giveItem"; target: { pcId: string } | { shared: true }; item: Omit<Item, "id"> & { id?: string } }
  | { type: "removeItem"; target: { pcId: string } | { shared: true }; itemId: string; quantity?: number }
  // --- Party ---
  | { type: "upsertPc"; pc: Upsert<PlayerCharacter> }
  | { type: "removePc"; pcId: string }
  | { type: "setPartyLocation"; locationId: string | undefined }
  | { type: "recordSpotlight"; sessionId: string; weights: Record<string, number>; note?: string }
  | { type: "setGoalStatus"; pcId: string; goalId: string; status: PlayerCharacter["goals"][number]["status"] }
  // --- World ---
  | { type: "upsertLocation"; location: Upsert<Location> }
  | { type: "removeLocation"; locationId: string }
  | { type: "upsertNpc"; npc: Upsert<Npc> }
  | { type: "removeNpc"; npcId: string }
  | { type: "setNpcMood"; npcId: string; mood: NpcMood }
  | { type: "setNpcStatus"; npcId: string; status: Npc["status"]; reason?: string }
  | { type: "adjustNpcRelationship"; npcId: string; delta: number }
  | { type: "npcRemember"; npcId: string; memory: MemoryInput }
  | { type: "setNpcAssets"; npcId: string; assets: Npc["assets"] }
  | { type: "upsertFaction"; faction: Upsert<Faction> }
  | { type: "upsertStatBlock"; statBlock: Upsert<StatBlock> }
  | { type: "upsertPlotThread"; thread: Upsert<PlotThread> }
  | { type: "setThreadStatus"; threadId: string; status: PlotThread["status"] }
  | { type: "upsertFact"; fact: Upsert<Fact> }
  | { type: "upsertShop"; shop: Upsert<Shop> }
  | { type: "upsertEncounter"; encounter: Upsert<Encounter> }
  | { type: "setEncounterStatus"; encounterId: string; status: Encounter["status"] }
  | { type: "approveProvisional"; kind: "location" | "npc"; id: string }
  // --- Knowledge (fog) ---
  | { type: "revealFact"; factId: string; pcId?: string }
  | { type: "forgetFact"; factId: string; pcId?: string }
  // --- Sessions ---
  | { type: "createSession"; title?: string; date?: string; id?: string }
  | { type: "setSessionStatus"; sessionId: string; status: Session["status"] }
  | { type: "logEvent"; sessionId: string; event: EventInput }
  | { type: "setRecap"; sessionId: string; playerRecap?: string; dmRecap?: string }
  // --- Consequences ---
  | { type: "addConsequence"; consequence: ConsequenceInput }
  | { type: "setConsequenceStatus"; consequenceId: string; status: Consequence["status"]; sessionId?: string }
  // --- Campaign meta ---
  | { type: "updateMeta"; patch: Partial<Pick<Campaign, "name" | "setting" | "tone" | "houseRules" | "safety">> }
  | { type: "setFeatureFlag"; flag: string; enabled: boolean };

export class InvalidActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidActionError";
  }
}

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const copy = [...list];
  copy[idx] = item;
  return copy;
}

function requirePcIndex(c: Campaign, pcId: string): number {
  const idx = c.party.members.findIndex((m) => m.id === pcId);
  if (idx === -1) throw new InvalidActionError(`Unknown PC ${pcId}`);
  return idx;
}

function updatePc(c: Campaign, pcId: string, fn: (pc: PlayerCharacter) => PlayerCharacter): Campaign {
  const idx = requirePcIndex(c, pcId);
  const members = [...c.party.members];
  members[idx] = fn(members[idx] as PlayerCharacter);
  return { ...c, party: { ...c.party, members } };
}

function updateNpc(c: Campaign, npcId: string, fn: (npc: Npc) => Npc): Campaign {
  const idx = c.world.npcs.findIndex((n) => n.id === npcId);
  if (idx === -1) throw new InvalidActionError(`Unknown NPC ${npcId}`);
  const npcs = [...c.world.npcs];
  npcs[idx] = fn(npcs[idx] as Npc);
  return { ...c, world: { ...c.world, npcs } };
}

function updateSession(c: Campaign, sessionId: string, fn: (s: Session) => Session): Campaign {
  const idx = c.sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) throw new InvalidActionError(`Unknown session ${sessionId}`);
  const sessions = [...c.sessions];
  sessions[idx] = fn(sessions[idx] as Session);
  return { ...c, sessions };
}

function recordOverride(c: Campaign, ctx: ReducerContext, path: string, previous: unknown, next: unknown, reason = ""): Campaign {
  return {
    ...c,
    overrides: [...c.overrides, { id: ctx.id("ovr"), at: ctx.now(), path, previous, next, reason }],
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Applies one action. Throws InvalidActionError for unknown references. Never mutates input. */
export function reduceCampaign(campaign: Campaign, action: CampaignAction, ctx: ReducerContext = defaultContext): Campaign {
  const next = applyAction(campaign, action, ctx);
  return { ...next, updatedAt: ctx.now() };
}

/** Applies many actions in order. */
export function reduceAll(campaign: Campaign, actions: CampaignAction[], ctx: ReducerContext = defaultContext): Campaign {
  return actions.reduce((c, a) => reduceCampaign(c, a, ctx), campaign);
}

function applyAction(c: Campaign, a: CampaignAction, ctx: ReducerContext): Campaign {
  switch (a.type) {
    case "override": {
      const previous = getAtPath(c, a.path);
      if (previous === undefined) throw new InvalidActionError(`Path "${a.path}" does not exist`);
      const updated = setAtPath(c, a.path, a.value);
      const check = CampaignSchema.safeParse(updated);
      if (!check.success) {
        throw new InvalidActionError(
          `Override at "${a.path}" produces an invalid campaign: ${check.error.issues.map((i) => i.message).join("; ")}`,
        );
      }
      return recordOverride(check.data, ctx, a.path, previous, a.value, a.reason);
    }
    case "setPcHp": {
      const idx = requirePcIndex(c, a.pcId);
      const pc = c.party.members[idx] as PlayerCharacter;
      const value = clamp(Math.round(a.value), 0, Math.max(pc.maxHp, 0));
      const updated = updatePc(c, a.pcId, (p) => ({ ...p, currentHp: value }));
      return recordOverride(updated, ctx, `party.members.${idx}.currentHp`, pc.currentHp, value, a.reason);
    }
    case "adjustPcHp": {
      const idx = requirePcIndex(c, a.pcId);
      const pc = c.party.members[idx] as PlayerCharacter;
      // Damage eats temp HP first (5e rule); healing never exceeds max.
      let temp = pc.tempHp;
      let hp = pc.currentHp;
      let delta = Math.round(a.delta);
      if (delta < 0) {
        const absorbed = Math.min(temp, -delta);
        temp -= absorbed;
        delta += absorbed;
      }
      hp = clamp(hp + delta, 0, pc.maxHp);
      const updated = updatePc(c, a.pcId, (p) => ({ ...p, currentHp: hp, tempHp: temp }));
      return recordOverride(updated, ctx, `party.members.${idx}.currentHp`, pc.currentHp, hp, a.reason);
    }
    case "setPcTempHp":
      return updatePc(c, a.pcId, (p) => ({ ...p, tempHp: Math.max(0, Math.round(a.value)) }));
    case "adjustGold":
    case "setGold": {
      if ("shared" in a.target) {
        const prev = c.party.sharedGold;
        const value = Math.max(0, a.type === "adjustGold" ? prev + a.delta : a.value);
        const updated = { ...c, party: { ...c.party, sharedGold: value } };
        return recordOverride(updated, ctx, "party.sharedGold", prev, value, a.reason);
      }
      const idx = requirePcIndex(c, a.target.pcId);
      const pc = c.party.members[idx] as PlayerCharacter;
      const value = Math.max(0, a.type === "adjustGold" ? pc.gold + a.delta : a.value);
      const updated = updatePc(c, pc.id, (p) => ({ ...p, gold: value }));
      return recordOverride(updated, ctx, `party.members.${idx}.gold`, pc.gold, value, a.reason);
    }
    case "setPcXp": {
      const idx = requirePcIndex(c, a.pcId);
      const pc = c.party.members[idx] as PlayerCharacter;
      const value = Math.max(0, Math.round(a.value));
      const updated = updatePc(c, a.pcId, (p) => ({ ...p, xp: value }));
      return recordOverride(updated, ctx, `party.members.${idx}.xp`, pc.xp, value, a.reason);
    }
    case "awardXp": {
      const targets = a.pcIds ?? c.party.members.map((m) => m.id);
      if (targets.length === 0) return c;
      const share = Math.floor(a.amount / targets.length);
      let out = c;
      for (const pcId of targets) out = updatePc(out, pcId, (p) => ({ ...p, xp: Math.max(0, p.xp + share) }));
      return out;
    }
    case "setPcLevel": {
      const idx = requirePcIndex(c, a.pcId);
      const pc = c.party.members[idx] as PlayerCharacter;
      const value = clamp(Math.round(a.value), 1, 20);
      const updated = updatePc(c, a.pcId, (p) => ({ ...p, level: value }));
      return recordOverride(updated, ctx, `party.members.${idx}.level`, pc.level, value, a.reason);
    }
    case "setFlag": {
      const prev = c.world.flags[a.key];
      const updated = { ...c, world: { ...c.world, flags: { ...c.world.flags, [a.key]: a.value } } };
      return recordOverride(updated, ctx, `world.flags.${a.key}`, prev, a.value, a.reason);
    }
    case "adjustReputation":
    case "setReputation": {
      const idx = c.world.factions.findIndex((f) => f.id === a.factionId);
      if (idx === -1) throw new InvalidActionError(`Unknown faction ${a.factionId}`);
      const f = c.world.factions[idx] as Faction;
      const value = clamp(a.type === "adjustReputation" ? f.reputation + a.delta : a.value, -100, 100);
      const factions = [...c.world.factions];
      factions[idx] = { ...f, reputation: value };
      return recordOverride({ ...c, world: { ...c.world, factions } }, ctx, `world.factions.${idx}.reputation`, f.reputation, value, a.reason);
    }
    case "useSpellSlot":
      return updatePc(c, a.pcId, (p) => ({
        ...p,
        spellSlots: p.spellSlots.map((s) =>
          s.level === a.level ? { ...s, used: clamp(s.used + (a.delta ?? 1), 0, s.max) } : s,
        ),
      }));
    case "useResource":
      return updatePc(c, a.pcId, (p) => ({
        ...p,
        resources: p.resources.map((r) =>
          r.name === a.name ? { ...r, used: clamp(r.used + (a.delta ?? 1), 0, r.max) } : r,
        ),
      }));
    case "rest": {
      const targets = new Set(a.pcIds ?? c.party.members.map((m) => m.id));
      const members = c.party.members.map((p) => {
        if (!targets.has(p.id)) return p;
        if (a.kind === "long") {
          return {
            ...p,
            currentHp: p.maxHp,
            tempHp: 0,
            spellSlots: p.spellSlots.map((s) => ({ ...s, used: 0 })),
            resources: p.resources.map((r) => (r.recharge === "other" ? r : { ...r, used: 0 })),
          };
        }
        return {
          ...p,
          resources: p.resources.map((r) => (r.recharge === "short-rest" ? { ...r, used: 0 } : r)),
        };
      });
      return { ...c, party: { ...c.party, members } };
    }
    case "giveItem": {
      const item: Item = { ...a.item, id: a.item.id ?? ctx.id("item") } as Item;
      if ("shared" in a.target) {
        return { ...c, party: { ...c.party, sharedInventory: upsertById(c.party.sharedInventory, item) } };
      }
      return updatePc(c, a.target.pcId, (p) => ({ ...p, inventory: upsertById(p.inventory, item) }));
    }
    case "removeItem": {
      const remove = (list: Item[]): Item[] =>
        list
          .map((it) => (it.id === a.itemId ? { ...it, quantity: it.quantity - (a.quantity ?? it.quantity) } : it))
          .filter((it) => it.quantity > 0);
      if ("shared" in a.target) return { ...c, party: { ...c.party, sharedInventory: remove(c.party.sharedInventory) } };
      return updatePc(c, a.target.pcId, (p) => ({ ...p, inventory: remove(p.inventory) }));
    }
    case "upsertPc":
      return { ...c, party: { ...c.party, members: upsertById(c.party.members, a.pc) } };
    case "removePc":
      return { ...c, party: { ...c.party, members: c.party.members.filter((m) => m.id !== a.pcId) } };
    case "setPartyLocation": {
      const party = { ...c.party, currentLocationId: a.locationId };
      if (a.locationId) {
        const locations = c.world.locations.map((l) => (l.id === a.locationId ? { ...l, discoveredByParty: true } : l));
        return { ...c, party, world: { ...c.world, locations } };
      }
      return { ...c, party };
    }
    case "recordSpotlight": {
      const members = c.party.members.map((p) => {
        const w = a.weights[p.id];
        if (w === undefined) return p;
        const spotlight = p.spotlight.filter((s) => s.sessionId !== a.sessionId);
        spotlight.push({ sessionId: a.sessionId, weight: clamp(w, 0, 1), note: a.note ?? "" });
        return { ...p, spotlight };
      });
      return { ...c, party: { ...c.party, members } };
    }
    case "setGoalStatus":
      return updatePc(c, a.pcId, (p) => ({
        ...p,
        goals: p.goals.map((g) => (g.id === a.goalId ? { ...g, status: a.status } : g)),
      }));
    case "upsertLocation":
      return { ...c, world: { ...c.world, locations: upsertById(c.world.locations, a.location) } };
    case "removeLocation":
      return { ...c, world: { ...c.world, locations: c.world.locations.filter((l) => l.id !== a.locationId) } };
    case "upsertNpc":
      return { ...c, world: { ...c.world, npcs: upsertById(c.world.npcs, a.npc) } };
    case "removeNpc":
      return { ...c, world: { ...c.world, npcs: c.world.npcs.filter((n) => n.id !== a.npcId) } };
    case "setNpcMood":
      return updateNpc(c, a.npcId, (n) => ({ ...n, mood: a.mood }));
    case "setNpcStatus": {
      const idx = c.world.npcs.findIndex((n) => n.id === a.npcId);
      if (idx === -1) throw new InvalidActionError(`Unknown NPC ${a.npcId}`);
      const prev = (c.world.npcs[idx] as Npc).status;
      const updated = updateNpc(c, a.npcId, (n) => ({ ...n, status: a.status }));
      return recordOverride(updated, ctx, `world.npcs.${idx}.status`, prev, a.status, a.reason);
    }
    case "adjustNpcRelationship":
      return updateNpc(c, a.npcId, (n) => ({ ...n, relationshipToParty: clamp(n.relationshipToParty + a.delta, -100, 100) }));
    case "npcRemember":
      return updateNpc(c, a.npcId, (n) => ({
        ...n,
        memories: [...n.memories, { sentiment: 0, ...a.memory, createdAt: a.memory.createdAt ?? ctx.now() }],
      }));
    case "setNpcAssets":
      return updateNpc(c, a.npcId, (n) => ({ ...n, assets: { ...n.assets, ...a.assets } }));
    case "upsertFaction":
      return { ...c, world: { ...c.world, factions: upsertById(c.world.factions, a.faction) } };
    case "upsertStatBlock":
      return { ...c, world: { ...c.world, statBlocks: upsertById(c.world.statBlocks, a.statBlock) } };
    case "upsertPlotThread":
      return { ...c, world: { ...c.world, plotThreads: upsertById(c.world.plotThreads, a.thread) } };
    case "setThreadStatus":
      return {
        ...c,
        world: {
          ...c.world,
          plotThreads: c.world.plotThreads.map((t) => (t.id === a.threadId ? { ...t, status: a.status } : t)),
        },
      };
    case "upsertFact":
      return { ...c, world: { ...c.world, facts: upsertById(c.world.facts, a.fact) } };
    case "upsertShop":
      return { ...c, world: { ...c.world, shops: upsertById(c.world.shops, a.shop) } };
    case "upsertEncounter":
      return { ...c, world: { ...c.world, encounters: upsertById(c.world.encounters, a.encounter) } };
    case "setEncounterStatus":
      return {
        ...c,
        world: {
          ...c.world,
          encounters: c.world.encounters.map((e) => (e.id === a.encounterId ? { ...e, status: a.status } : e)),
        },
      };
    case "approveProvisional":
      if (a.kind === "location") {
        return {
          ...c,
          world: { ...c.world, locations: c.world.locations.map((l) => (l.id === a.id ? { ...l, provisional: false } : l)) },
        };
      }
      return updateNpc(c, a.id, (n) => ({ ...n, provisional: false }));
    case "revealFact": {
      if (!c.world.facts.some((f) => f.id === a.factId)) throw new InvalidActionError(`Unknown fact ${a.factId}`);
      if (a.pcId) {
        return updatePc(c, a.pcId, (p) =>
          p.privateKnowledge.includes(a.factId) ? p : { ...p, privateKnowledge: [...p.privateKnowledge, a.factId] },
        );
      }
      if (c.knowledge.partyKnown.includes(a.factId)) return c;
      return { ...c, knowledge: { ...c.knowledge, partyKnown: [...c.knowledge.partyKnown, a.factId] } };
    }
    case "forgetFact": {
      if (a.pcId) {
        return updatePc(c, a.pcId, (p) => ({ ...p, privateKnowledge: p.privateKnowledge.filter((f) => f !== a.factId) }));
      }
      return { ...c, knowledge: { ...c.knowledge, partyKnown: c.knowledge.partyKnown.filter((f) => f !== a.factId) } };
    }
    case "createSession": {
      const number = c.sessions.reduce((m, s) => Math.max(m, s.number), 0) + 1;
      const session: Session = {
        id: a.id ?? ctx.id("ses"),
        number,
        title: a.title ?? `Session ${number}`,
        date: a.date,
        status: "planned",
        events: [],
        playerRecap: "",
        dmRecap: "",
      };
      return { ...c, sessions: [...c.sessions, session] };
    }
    case "setSessionStatus":
      return updateSession(c, a.sessionId, (s) => ({ ...s, status: a.status }));
    case "logEvent": {
      const event: SessionEvent = {
        secret: false,
        pcIds: [],
        npcIds: [],
        tags: [],
        ...a.event,
        id: a.event.id ?? ctx.id("evt"),
        at: a.event.at ?? ctx.now(),
      };
      return updateSession(c, a.sessionId, (s) => ({ ...s, events: [...s.events, event] }));
    }
    case "setRecap":
      return updateSession(c, a.sessionId, (s) => ({
        ...s,
        playerRecap: a.playerRecap ?? s.playerRecap,
        dmRecap: a.dmRecap ?? s.dmRecap,
      }));
    case "addConsequence": {
      const consequence: Consequence = {
        severity: "moderate",
        affectedNpcIds: [],
        affectedFactionIds: [],
        affectedPcIds: [],
        status: "pending",
        tags: [],
        ...a.consequence,
        id: a.consequence.id ?? ctx.id("csq"),
      };
      return { ...c, consequences: [...c.consequences, consequence] };
    }
    case "setConsequenceStatus":
      return {
        ...c,
        consequences: c.consequences.map((q) =>
          q.id === a.consequenceId
            ? { ...q, status: a.status, surfacedInSessionId: a.status === "surfaced" ? (a.sessionId ?? q.surfacedInSessionId) : q.surfacedInSessionId }
            : q,
        ),
      };
    case "updateMeta":
      return { ...c, ...a.patch };
    case "setFeatureFlag":
      return { ...c, featureFlags: { ...c.featureFlags, [a.flag]: a.enabled } };
    default: {
      const never: never = a;
      throw new InvalidActionError(`Unknown action ${(never as { type: string }).type}`);
    }
  }
}

/** Convenience: dot path to a PC field, for the override action. */
export function pcPath(campaign: Campaign, pcId: string, field: keyof PlayerCharacter): string {
  const idx = requirePcIndex(campaign, pcId);
  return `party.members.${idx}.${String(field)}`;
}
