/**
 * Fog of knowledge: (a) objective truth lives in world.facts, (b) what the party
 * knows is knowledge.partyKnown, (c) what individual PCs know privately is
 * pc.privateKnowledge. `playerSafeView` is the ONLY thing that should ever be
 * shown or sent toward players.
 */
import type { Campaign, Fact, Location, Npc, PlotThread, SessionEvent } from "./schema.js";

export type KnowledgeScope = "party" | "pc" | "backstage";

export interface FactKnowledge {
  fact: Fact;
  scope: KnowledgeScope;
  /** PC ids that know it privately (when scope is "pc"). */
  pcIds: string[];
}

export function factKnowledge(campaign: Campaign, factId: string): FactKnowledge | undefined {
  const fact = campaign.world.facts.find((f) => f.id === factId);
  if (!fact) return undefined;
  if (campaign.knowledge.partyKnown.includes(factId) || !fact.secret) return { fact, scope: "party", pcIds: campaign.party.members.map((m) => m.id) };
  const pcIds = campaign.party.members.filter((m) => m.privateKnowledge.includes(factId)).map((m) => m.id);
  if (pcIds.length > 0) return { fact, scope: "pc", pcIds };
  return { fact, scope: "backstage", pcIds: [] };
}

export function partyKnownFacts(campaign: Campaign): Fact[] {
  return campaign.world.facts.filter((f) => !f.secret || campaign.knowledge.partyKnown.includes(f.id));
}

export function backstageFacts(campaign: Campaign): Fact[] {
  return campaign.world.facts.filter((f) => factKnowledge(campaign, f.id)?.scope === "backstage");
}

/** Facts one PC knows that the rest of the party does not. */
export function pcOnlyKnowledge(campaign: Campaign, pcId: string): Fact[] {
  const pc = campaign.party.members.find((m) => m.id === pcId);
  if (!pc) return [];
  return pc.privateKnowledge
    .filter((id) => !campaign.knowledge.partyKnown.includes(id))
    .map((id) => campaign.world.facts.find((f) => f.id === id))
    .filter((f): f is Fact => !!f && f.secret);
}

export interface PlayerSafeView {
  locations: Pick<Location, "id" | "name" | "kind" | "parentId" | "description">[];
  npcs: Pick<Npc, "id" | "name" | "role" | "appearance" | "status">[];
  facts: Pick<Fact, "id" | "statement">[];
  threads: Pick<PlotThread, "id" | "title" | "summary" | "status">[];
  events: Pick<SessionEvent, "id" | "at" | "kind" | "text">[];
}

/** Strips every backstage field. Used to build recaps and any player-facing artifact. */
export function playerSafeView(campaign: Campaign, sessionId?: string): PlayerSafeView {
  const metNpcIds = new Set<string>();
  for (const s of campaign.sessions) for (const e of s.events) if (!e.secret) for (const id of e.npcIds) metNpcIds.add(id);
  const sessions = sessionId ? campaign.sessions.filter((s) => s.id === sessionId) : campaign.sessions;
  return {
    locations: campaign.world.locations
      .filter((l) => l.discoveredByParty && !l.provisional)
      .map(({ id, name, kind, parentId, description }) => ({ id, name, kind, parentId, description })),
    npcs: campaign.world.npcs
      .filter((n) => !n.secret && metNpcIds.has(n.id))
      .map(({ id, name, role, appearance, status }) => ({ id, name, role, appearance, status: status === "dead" ? ("dead" as const) : ("alive" as const) })),
    facts: partyKnownFacts(campaign).map(({ id, statement }) => ({ id, statement })),
    threads: campaign.world.plotThreads.filter((t) => !t.secret).map(({ id, title, summary, status }) => ({ id, title, summary, status })),
    events: sessions.flatMap((s) => s.events.filter((e) => !e.secret).map(({ id, at, kind, text }) => ({ id, at, kind, text }))),
  };
}

/**
 * Terms that must never appear in player-facing text: secret NPC names,
 * secret motives' key phrases, backstage fact statements. Returned lowercased.
 */
export function backstageTerms(campaign: Campaign): string[] {
  const terms: string[] = [];
  for (const n of campaign.world.npcs) {
    if (n.secret) terms.push(n.name);
    if (n.secretMotive.trim()) terms.push(n.secretMotive.trim());
  }
  for (const f of backstageFacts(campaign)) terms.push(f.statement.trim());
  for (const t of campaign.world.plotThreads) if (t.secret) terms.push(t.title);
  for (const f of campaign.world.factions) if (f.secret) terms.push(f.name);
  for (const l of campaign.world.locations) if (l.secretNotes.trim()) terms.push(l.secretNotes.trim());
  return terms.filter((t) => t.length >= 4).map((t) => t.toLowerCase());
}

/** Returns backstage terms that leak into the given text. Empty array = clean. */
export function findLeaks(text: string, campaign: Campaign): string[] {
  const lower = text.toLowerCase();
  return backstageTerms(campaign).filter((t) => lower.includes(t));
}
