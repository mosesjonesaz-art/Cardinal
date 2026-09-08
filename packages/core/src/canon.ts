/**
 * Canon consistency checks (structural, LLM-free). Run on every save and before
 * committing AI-proposed additions. Codes are stable so the UI can filter them.
 */
import type { Campaign, Location, SessionEvent } from "./schema.js";

export type CanonIssueCode =
  | "DEAD_NPC_ACTIVE"
  | "NPC_LOCATION_MISSING"
  | "NPC_FACTION_MISSING"
  | "LOCATION_PARENT_MISSING"
  | "LOCATION_CYCLE"
  | "DUPLICATE_NAME"
  | "THREAD_REF_MISSING"
  | "RESOLVED_THREAD_ACTIVITY"
  | "FACT_REF_MISSING"
  | "STATBLOCK_MISSING"
  | "CONSEQUENCE_REF_MISSING"
  | "PARTY_LOCATION_MISSING"
  | "PROVISIONAL_CONTENT"
  | "SAFETY_LINE_HIT";

export interface CanonIssue {
  code: CanonIssueCode;
  severity: "error" | "warning" | "info";
  message: string;
  refs: string[];
}

export function checkCanon(campaign: Campaign, knownStatBlockIds: readonly string[] = []): CanonIssue[] {
  const issues: CanonIssue[] = [];
  const w = campaign.world;
  const locIds = new Set(w.locations.map((l) => l.id));
  const npcIds = new Set(w.npcs.map((n) => n.id));
  const factionIds = new Set(w.factions.map((f) => f.id));
  const factIds = new Set(w.facts.map((f) => f.id));
  const threadIds = new Set(w.plotThreads.map((t) => t.id));
  const statBlockIds = new Set([...w.statBlocks.map((s) => s.id), ...knownStatBlockIds]);
  const deadNpcs = new Map(w.npcs.filter((n) => n.status === "dead").map((n) => [n.id, n.name]));

  // Locations
  for (const l of w.locations) {
    if (l.parentId && !locIds.has(l.parentId))
      issues.push({ code: "LOCATION_PARENT_MISSING", severity: "error", message: `Location "${l.name}" has missing parent ${l.parentId}.`, refs: [l.id] });
    if (hasCycle(l, w.locations))
      issues.push({ code: "LOCATION_CYCLE", severity: "error", message: `Location "${l.name}" is its own ancestor.`, refs: [l.id] });
    if (l.provisional)
      issues.push({ code: "PROVISIONAL_CONTENT", severity: "info", message: `Location "${l.name}" was generated live and awaits DM review.`, refs: [l.id] });
  }
  if (campaign.party.currentLocationId && !locIds.has(campaign.party.currentLocationId))
    issues.push({ code: "PARTY_LOCATION_MISSING", severity: "error", message: "Party location points to a missing location.", refs: [campaign.party.currentLocationId] });

  // NPCs
  for (const n of w.npcs) {
    if (n.locationId && !locIds.has(n.locationId))
      issues.push({ code: "NPC_LOCATION_MISSING", severity: "warning", message: `NPC "${n.name}" is placed in missing location ${n.locationId}.`, refs: [n.id] });
    if (n.factionId && !factionIds.has(n.factionId))
      issues.push({ code: "NPC_FACTION_MISSING", severity: "warning", message: `NPC "${n.name}" belongs to missing faction ${n.factionId}.`, refs: [n.id] });
    if (n.statBlockId && !statBlockIds.has(n.statBlockId))
      issues.push({ code: "STATBLOCK_MISSING", severity: "warning", message: `NPC "${n.name}" references missing stat block ${n.statBlockId}.`, refs: [n.id] });
    if (n.provisional)
      issues.push({ code: "PROVISIONAL_CONTENT", severity: "info", message: `NPC "${n.name}" was generated live and awaits DM review.`, refs: [n.id] });
  }

  // Duplicate names (case-insensitive) across NPCs and locations
  for (const [label, list] of [
    ["NPC", w.npcs.map((n) => ({ id: n.id, name: n.name }))],
    ["Location", w.locations.map((l) => ({ id: l.id, name: l.name }))],
  ] as const) {
    const seen = new Map<string, string>();
    for (const x of list) {
      const key = x.name.trim().toLowerCase();
      const prev = seen.get(key);
      if (prev) issues.push({ code: "DUPLICATE_NAME", severity: "warning", message: `${label} name "${x.name}" is used twice.`, refs: [prev, x.id] });
      else seen.set(key, x.id);
    }
  }

  // Threads & facts
  for (const t of w.plotThreads) {
    for (const id of t.involvedNpcIds) if (!npcIds.has(id)) issues.push({ code: "THREAD_REF_MISSING", severity: "warning", message: `Thread "${t.title}" references missing NPC ${id}.`, refs: [t.id, id] });
    for (const id of t.involvedFactionIds) if (!factionIds.has(id)) issues.push({ code: "THREAD_REF_MISSING", severity: "warning", message: `Thread "${t.title}" references missing faction ${id}.`, refs: [t.id, id] });
  }
  for (const id of campaign.knowledge.partyKnown) if (!factIds.has(id)) issues.push({ code: "FACT_REF_MISSING", severity: "error", message: `Party knows missing fact ${id}.`, refs: [id] });
  for (const pc of campaign.party.members)
    for (const id of pc.privateKnowledge) if (!factIds.has(id)) issues.push({ code: "FACT_REF_MISSING", severity: "error", message: `${pc.name} knows missing fact ${id}.`, refs: [pc.id, id] });
  for (const pc of campaign.party.members)
    for (const g of pc.goals) for (const id of g.relatedThreadIds) if (!threadIds.has(id)) issues.push({ code: "THREAD_REF_MISSING", severity: "warning", message: `${pc.name}'s goal references missing thread ${id}.`, refs: [pc.id, id] });

  // Encounters
  for (const e of w.encounters)
    for (const m of e.monsters) if (!statBlockIds.has(m.statBlockId)) issues.push({ code: "STATBLOCK_MISSING", severity: "error", message: `Encounter "${e.name}" references missing stat block ${m.statBlockId}.`, refs: [e.id, m.statBlockId] });

  // Consequences
  for (const q of campaign.consequences) {
    for (const id of q.affectedNpcIds) if (!npcIds.has(id)) issues.push({ code: "CONSEQUENCE_REF_MISSING", severity: "warning", message: `Consequence "${q.description}" references missing NPC ${id}.`, refs: [q.id, id] });
    for (const id of q.affectedFactionIds) if (!factionIds.has(id)) issues.push({ code: "CONSEQUENCE_REF_MISSING", severity: "warning", message: `Consequence "${q.description}" references missing faction ${id}.`, refs: [q.id, id] });
  }

  // Dead NPCs acting in later events
  const deathEvents = new Map<string, string>(); // npcId -> event at
  for (const s of campaign.sessions)
    for (const e of s.events)
      if (e.tags.includes("death")) for (const id of e.npcIds) if (!deathEvents.has(id)) deathEvents.set(id, e.at);
  for (const s of campaign.sessions)
    for (const e of s.events)
      if (e.kind === "npc-interaction")
        for (const id of e.npcIds) {
          const diedAt = deathEvents.get(id);
          if (deadNpcs.has(id) && diedAt && e.at > diedAt && !e.tags.includes("death") && !e.tags.includes("posthumous"))
            issues.push({ code: "DEAD_NPC_ACTIVE", severity: "error", message: `"${deadNpcs.get(id)}" is dead but interacts in "${e.text.slice(0, 60)}".`, refs: [id, e.id] });
        }

  // Activity on resolved threads
  const resolved = new Set(w.plotThreads.filter((t) => t.status === "resolved").map((t) => t.id));
  const last = campaign.sessions[campaign.sessions.length - 1];
  if (last)
    for (const e of last.events)
      for (const tag of e.tags)
        if (tag.startsWith("thread:") && resolved.has(tag.slice(7)))
          issues.push({ code: "RESOLVED_THREAD_ACTIVITY", severity: "warning", message: `Event "${e.text.slice(0, 60)}" touches resolved thread ${tag.slice(7)}.`, refs: [e.id, tag.slice(7)] });

  return issues;
}

/** Pre-commit check for a single proposed event (e.g. AI suggests a dead NPC speaks). */
export function checkEventAgainstCanon(campaign: Campaign, event: Pick<SessionEvent, "npcIds" | "kind" | "tags" | "text">): CanonIssue[] {
  const issues: CanonIssue[] = [];
  for (const id of event.npcIds) {
    const npc = campaign.world.npcs.find((n) => n.id === id);
    if (npc?.status === "dead" && event.kind === "npc-interaction" && !event.tags.includes("posthumous"))
      issues.push({ code: "DEAD_NPC_ACTIVE", severity: "error", message: `"${npc.name}" is dead. Mark the event "posthumous" (vision, letter, undead) or change the NPC's status.`, refs: [id] });
  }
  for (const line of campaign.safety.lines) {
    if (line && event.text.toLowerCase().includes(line.toLowerCase()))
      issues.push({ code: "SAFETY_LINE_HIT", severity: "error", message: `Event text touches a safety line ("${line}").`, refs: [] });
  }
  return issues;
}

/** Scans generated text against the campaign's lines (hard) and veils (soft). */
export function scanSafety(text: string, safety: Campaign["safety"]): { lines: string[]; veils: string[] } {
  const lower = text.toLowerCase();
  return {
    lines: safety.lines.filter((l) => l.trim() && lower.includes(l.trim().toLowerCase())),
    veils: safety.veils.filter((v) => v.trim() && lower.includes(v.trim().toLowerCase())),
  };
}

function hasCycle(loc: Location, all: Location[]): boolean {
  const seen = new Set<string>([loc.id]);
  let cur = loc.parentId;
  while (cur) {
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = all.find((l) => l.id === cur)?.parentId;
  }
  return false;
}

/** Ancestor chain from the given location up to the root (region first). */
export function locationPath(campaign: Campaign, locationId: string): Location[] {
  const out: Location[] = [];
  const seen = new Set<string>();
  let cur = campaign.world.locations.find((l) => l.id === locationId);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? campaign.world.locations.find((l) => l.id === cur!.parentId) : undefined;
  }
  return out;
}

export function childLocations(campaign: Campaign, locationId: string | undefined): Location[] {
  return campaign.world.locations.filter((l) => (locationId ? l.parentId === locationId : !l.parentId));
}
