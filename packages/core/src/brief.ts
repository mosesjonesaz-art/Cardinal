/** Pre-session brief data (structured; the LLM layer turns it into prose). */
import { dueConsequences } from "./consequences.js";
import { readCampaignEncounter, type BalanceFlag, type EncounterRead } from "./encounter.js";
import { pcOnlyKnowledge } from "./knowledge.js";
import { openGoals, spotlightForecast, type SpotlightSummary } from "./party.js";
import { latestSession } from "./recap.js";
import type { RulesetConfig } from "./ruleset.js";
import type { Campaign, Consequence, Encounter, Location, Npc, PlotThread } from "./schema.js";
import { locationPath } from "./canon.js";
import { pendingLevelUps } from "./progression.js";

export interface PcDebrief {
  pcId: string;
  name: string;
  level: number;
  hp: string;
  openGoals: string[];
  privateSecretsCount: number;
  spotlight: SpotlightSummary;
}

export interface EncounterPreview {
  encounter: Encounter;
  read: EncounterRead;
}

export interface SessionBriefData {
  campaignName: string;
  nextSessionNumber: number;
  lastSessionSummary: string;
  currentLocation: Location | undefined;
  currentLocationPath: string;
  activeThreads: PlotThread[];
  likelyNpcs: Npc[];
  likelyLocations: Location[];
  pcDebriefs: PcDebrief[];
  spotlightForecast: SpotlightSummary[];
  dueConsequences: Consequence[];
  plannedEncounters: EncounterPreview[];
  balanceFlags: { encounterName: string; flag: BalanceFlag }[];
  pendingLevelUps: { name: string; from: number; to: number }[];
}

export function buildSessionBriefData(campaign: Campaign, config: RulesetConfig): SessionBriefData {
  const last = latestSession(campaign);
  const nextSessionNumber = (last?.number ?? 0) + 1;
  const currentLocation = campaign.party.currentLocationId ? campaign.world.locations.find((l) => l.id === campaign.party.currentLocationId) : undefined;
  const path = currentLocation ? locationPath(campaign, currentLocation.id) : [];
  const activeThreads = campaign.world.plotThreads.filter((t) => t.status === "active");
  const npcScore = new Map<string, number>();
  const bump = (id: string, n: number) => npcScore.set(id, (npcScore.get(id) ?? 0) + n);
  for (const t of activeThreads) for (const id of t.involvedNpcIds) bump(id, 2);
  if (currentLocation) for (const n of campaign.world.npcs) if (n.locationId === currentLocation.id || path.some((p) => p.id === n.locationId)) bump(n.id, 3);
  if (last) for (const e of last.events) for (const id of e.npcIds) bump(id, 1);
  for (const c of dueConsequences(campaign, nextSessionNumber)) for (const id of c.affectedNpcIds) bump(id, 2);
  const likelyNpcs = [...npcScore.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => campaign.world.npcs.find((n) => n.id === id))
    .filter((n): n is Npc => !!n && n.status !== "dead")
    .slice(0, 8);
  const likelyLocations = currentLocation
    ? campaign.world.locations.filter((l) => l.parentId === currentLocation.id || l.id === currentLocation.parentId || (l.parentId && l.parentId === currentLocation.parentId && l.id !== currentLocation.id)).slice(0, 8)
    : campaign.world.locations.filter((l) => !l.discoveredByParty).slice(0, 5);
  const forecast = spotlightForecast(campaign.party, campaign.sessions);
  const pcDebriefs: PcDebrief[] = campaign.party.members.map((pc) => ({
    pcId: pc.id,
    name: pc.name,
    level: pc.level,
    hp: `${pc.currentHp}/${pc.maxHp}`,
    openGoals: openGoals(pc).map((g) => g.text),
    privateSecretsCount: pcOnlyKnowledge(campaign, pc.id).length,
    spotlight: forecast.find((f) => f.pcId === pc.id) as SpotlightSummary,
  }));
  const planned = campaign.world.encounters.filter((e) => e.status === "planned" || e.status === "proposed");
  const plannedEncounters = planned.map((encounter) => ({ encounter, read: readCampaignEncounter(config, campaign.party, encounter, campaign.world.statBlocks) }));
  const balanceFlags = plannedEncounters.flatMap((p) => p.read.flags.map((flag) => ({ encounterName: p.encounter.name, flag })));
  return {
    campaignName: campaign.name,
    nextSessionNumber,
    lastSessionSummary: last ? last.dmRecap || last.playerRecap || last.events.map((e) => e.text).slice(-5).join(" ") : "This is the first session.",
    currentLocation,
    currentLocationPath: path.map((p) => p.name).join(" › "),
    activeThreads,
    likelyNpcs,
    likelyLocations,
    pcDebriefs,
    spotlightForecast: forecast,
    dueConsequences: dueConsequences(campaign, nextSessionNumber),
    plannedEncounters,
    balanceFlags,
    pendingLevelUps: pendingLevelUps(config, campaign.party.members).map(({ name, from, to }) => ({ name, from, to })),
  };
}

/** Plain-text rendering used as the fail-soft brief when the LLM is unavailable. */
export function renderBriefText(d: SessionBriefData): string {
  const lines: string[] = [];
  lines.push(`${d.campaignName} — Session ${d.nextSessionNumber} brief`, "");
  lines.push("Where we left off:", d.lastSessionSummary, "");
  if (d.currentLocationPath) lines.push(`Party is at: ${d.currentLocationPath}`, "");
  if (d.activeThreads.length) lines.push("Active threads:", ...d.activeThreads.map((t) => `- ${t.title}${t.summary ? `: ${t.summary}` : ""}`), "");
  if (d.likelyNpcs.length) lines.push("Likely NPCs:", ...d.likelyNpcs.map((n) => `- ${n.name}${n.role ? ` (${n.role})` : ""}, mood ${n.mood}`), "");
  if (d.likelyLocations.length) lines.push("Nearby / likely locations:", ...d.likelyLocations.map((l) => `- ${l.name} (${l.kind})`), "");
  lines.push("Per-PC debrief:");
  for (const p of d.pcDebriefs) {
    lines.push(`- ${p.name} (L${p.level}, HP ${p.hp}): ${p.openGoals.length ? p.openGoals.join("; ") : "no open goals"}; ${p.privateSecretsCount} private secret(s); spotlight ${p.spotlight.deficit > 0.05 ? "OWED" : p.spotlight.deficit < -0.05 ? "recently heavy" : "balanced"}`);
  }
  lines.push("");
  if (d.dueConsequences.length) lines.push("Consequences to resurface:", ...d.dueConsequences.map((c) => `- [${c.severity}] ${c.description}`), "");
  if (d.plannedEncounters.length) lines.push("Planned encounters:", ...d.plannedEncounters.map((p) => `- ${p.encounter.name}: ${p.read.encounterXp} XP, ${p.read.difficultyAtFullRest} at full rest, ${p.read.difficultyNow} now`), "");
  if (d.balanceFlags.length) lines.push("Balance flags:", ...d.balanceFlags.map((b) => `- ${b.encounterName}: ${b.flag.message}`), "");
  if (d.pendingLevelUps.length) lines.push("Pending level-ups:", ...d.pendingLevelUps.map((l) => `- ${l.name}: ${l.from} → ${l.to}`), "");
  return lines.join("\n").trim();
}
