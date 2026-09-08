/** Principle 4: consequences persist. */
import type { Campaign, Consequence } from "./schema.js";

export function currentSessionNumber(campaign: Campaign): number {
  return campaign.sessions.reduce((m, s) => Math.max(m, s.number), 0);
}

/** Consequences the AI should proactively resurface for the given session number. */
export function dueConsequences(campaign: Campaign, sessionNumber = currentSessionNumber(campaign) + 1): Consequence[] {
  return campaign.consequences.filter(
    (c) => c.status === "pending" && (c.earliestSessionNumber === undefined || c.earliestSessionNumber <= sessionNumber),
  );
}

export function consequencesForNpc(campaign: Campaign, npcId: string): Consequence[] {
  return campaign.consequences.filter((c) => c.affectedNpcIds.includes(npcId) && c.status !== "resolved");
}

export function consequencesForFaction(campaign: Campaign, factionId: string): Consequence[] {
  return campaign.consequences.filter((c) => c.affectedFactionIds.includes(factionId) && c.status !== "resolved");
}

export function consequencesForLocation(campaign: Campaign, locationId: string): Consequence[] {
  const npcIds = new Set(campaign.world.npcs.filter((n) => n.locationId === locationId).map((n) => n.id));
  return campaign.consequences.filter((c) => c.status !== "resolved" && c.affectedNpcIds.some((id) => npcIds.has(id)));
}

/** Suggests consequence tags from an event's text and kind (cheap heuristics; the LLM can refine). */
export function suggestConsequenceTags(text: string, kind: string): string[] {
  const t = text.toLowerCase();
  const tags = new Set<string>();
  if (kind === "choice") tags.add("choice");
  if (/\b(kill|killed|slay|slain|murder)\b/.test(t)) tags.add("death");
  if (/\b(steal|stole|rob|theft|pickpocket)\b/.test(t)) tags.add("theft");
  if (/\b(promise|swear|oath|vow)\b/.test(t)) tags.add("promise");
  if (/\b(insult|threaten|humiliate)\b/.test(t)) tags.add("insult");
  if (/\b(rescue|save|saved|spared|spare)\b/.test(t)) tags.add("mercy");
  if (/\b(betray|lie|lied|deceive)\b/.test(t)) tags.add("betrayal");
  if (/\b(burn|destroy|destroyed|razed)\b/.test(t)) tags.add("destruction");
  return [...tags];
}
