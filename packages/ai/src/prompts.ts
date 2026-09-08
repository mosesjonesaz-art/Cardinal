/**
 * Shared prompt scaffolding. The system prompt is deliberately stable (it is
 * cached by the provider); per-call state goes in the user message.
 */
import type { Campaign, Npc, PlayerCharacter } from "@cardinal/core";

export const PRINCIPLES = `You are Cardinal, a backstage assistant to a tabletop RPG Dungeon Master (DM). You never address players; everything you write is for the DM's eyes only and the DM performs it at the table.

Rules you must follow:
1. DM-only. Include backstage material (secrets, motives, stat details) only in fields explicitly marked for the DM. Player-facing fields must contain no secrets.
2. Never fudge silently. If difficulty or outcomes should change, propose narratively justified options with a cost attached. The DM approves or rejects each one.
3. The state you are given is ground truth, including values the DM has overridden. Do not "correct" it.
4. Consequences persist. Reference past player choices, NPC memories and faction reputation when relevant.
5. The DM has absolute authority. Everything you produce is a suggestion that can be edited or discarded.
6. Respect the safety tools: never include content on the "lines" list; keep "veils" off-screen and undescribed.
7. Stay consistent with established canon (locations, NPC status, resolved threads). If something would contradict canon, say so in a DM-only note instead of inventing around it.
8. Be concise and performable: short read-aloud text, concrete hooks, one-line voice cues.`;

export function campaignFrame(campaign: Campaign): string {
  const lines = [
    `Campaign: ${campaign.name}`,
    `Ruleset: D&D 5e (2024 revision)`,
    campaign.setting ? `Setting: ${campaign.setting}` : "",
    campaign.tone ? `Tone: ${campaign.tone}` : "",
    campaign.houseRules.length ? `House rules: ${campaign.houseRules.join("; ")}` : "",
    `Safety lines (never include): ${campaign.safety.lines.length ? campaign.safety.lines.join("; ") : "none recorded"}`,
    `Safety veils (keep off-screen): ${campaign.safety.veils.length ? campaign.safety.veils.join("; ") : "none recorded"}`,
  ].filter(Boolean);
  return lines.join("\n");
}

export function partySummary(campaign: Campaign): string {
  return campaign.party.members
    .map((pc) => `- ${pc.name} (${pc.className || "?"} ${pc.level}), HP ${pc.currentHp}/${pc.maxHp}, ${pc.gold} gp${pc.goals.filter((g) => g.status !== "resolved" && g.status !== "abandoned").length ? `, goals: ${pc.goals.filter((g) => g.status === "open" || g.status === "progressing").map((g) => g.text).join("; ")}` : ""}`)
    .join("\n");
}

export function pcLine(pc: PlayerCharacter): string {
  return `${pc.name} (${pc.className || "?"} ${pc.level})`;
}

export function npcSummary(campaign: Campaign, npc: Npc, opts: { includeSecrets: boolean }): string {
  const loc = npc.locationId ? campaign.world.locations.find((l) => l.id === npc.locationId)?.name : undefined;
  const faction = npc.factionId ? campaign.world.factions.find((f) => f.id === npc.factionId)?.name : undefined;
  const parts = [
    `${npc.name}${npc.role ? `, ${npc.role}` : ""}${loc ? ` (at ${loc})` : ""}${faction ? ` [${faction}]` : ""}`,
    `status ${npc.status}, mood ${npc.mood}, relationship to party ${npc.relationshipToParty}`,
    npc.appearance ? `appearance: ${npc.appearance}` : "",
    npc.personality ? `personality: ${npc.personality}` : "",
    npc.motive ? `wants: ${npc.motive}` : "",
    opts.includeSecrets && npc.secretMotive ? `SECRET motive (DM only): ${npc.secretMotive}` : "",
    npc.mannerisms.length ? `mannerisms: ${npc.mannerisms.join("; ")}` : "",
    `voice: pitch ${npc.voice.pitch}, pace ${npc.voice.pace}${npc.voice.texture ? `, ${npc.voice.texture}` : ""}${npc.voice.accent ? `, ${npc.voice.accent} accent` : ""}${npc.voice.catchphrases.length ? `, says "${npc.voice.catchphrases.join('" / "')}"` : ""}`,
    npc.memories.length ? `remembers: ${npc.memories.slice(-5).map((m) => m.summary).join(" | ")}` : "",
  ].filter(Boolean);
  return parts.join("\n  ");
}

export function recentEvents(campaign: Campaign, limit = 12): string {
  const events = campaign.sessions.flatMap((s) => s.events.map((e) => ({ s: s.number, e }))).slice(-limit);
  if (!events.length) return "(no events yet)";
  return events.map(({ s, e }) => `- [S${s} ${e.kind}${e.secret ? " SECRET" : ""}] ${e.text}`).join("\n");
}

export function json(v: unknown): string {
  return JSON.stringify(v, null, 0);
}
