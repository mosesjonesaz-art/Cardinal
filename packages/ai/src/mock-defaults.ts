/**
 * Default handlers for the MockProvider: deterministic, schema-valid outputs derived
 * from the structured input. Lets the whole app run with no API key or network
 * (demo mode, airplane mode at the table, tests).
 */
import { buildPlayerRecap, buildSessionBriefData, suggestTactics, type Campaign } from "@cardinal/core";
import { moodVoiceDirective } from "./assets.js";
import { candidateStatBlocks, type EncounterInput } from "./generators/encounter.js";
import { baselineLevers, type LeversInput } from "./generators/levers.js";
import type { LocationSceneInput } from "./generators/location.js";
import type { NpcCardInput } from "./generators/npc.js";
import type { OffScriptInput } from "./generators/offscript.js";
import type { RecapInput } from "./generators/recap.js";
import type { ShopInput } from "./generators/shop.js";
import type { TacticsInput } from "./generators/tactics.js";
import type { BriefInput } from "./generators/brief.js";
import { shopGenerator } from "./generators/shop.js";
import type { MockHandler } from "./providers/mock.js";
import { xpForCr, targetXpBand } from "@cardinal/core";

export const defaultMockHandlers: Record<string, MockHandler> = {
  locationScene: (ctx) => {
    const { campaign, locationId, hint } = ctx as LocationSceneInput;
    const loc = campaign.world.locations.find((l) => l.id === locationId);
    const npcs = campaign.world.npcs.filter((n) => n.locationId === locationId && n.status !== "dead");
    return {
      readAloud: `${loc?.description || `You arrive at ${loc?.name ?? "the place"}.`}${hint ? ` ${hint}.` : ""} The air smells of woodsmoke and river water.`,
      ambient: ["A dog barks somewhere close.", "Lantern light flickers behind shutters."],
      presentNpcs: npcs.map((n) => ({ npcId: n.id, hook: n.motive || `${n.name} is here.` })),
      hooks: loc?.hooks.length ? loc.hooks : ["A stranger watches the party a beat too long."],
      dmNotes: loc?.secretNotes ? [loc.secretNotes] : [],
    };
  },
  offScript: (ctx) => {
    const { dmPrompt } = ctx as OffScriptInput;
    return {
      location: { name: titleCase(dmPrompt).slice(0, 40) || "Forgotten Place", kind: "landmark", description: `${dmPrompt}. Moss, silence, and the sense of being watched.`, hooks: ["Fresh footprints lead deeper."], secretNotes: "A smugglers' cache is hidden under the roots." },
      npcs: [{ name: "Tamsin Vey", role: "poacher", appearance: "Weathered, one eye clouded.", personality: "Blunt, superstitious.", mannerisms: ["spits before answering"], voice: { pitch: "low", pace: "slow", texture: "gravelly", accent: "", catchphrases: ["Ain't my business."], notes: "" }, motive: "Be left alone", secretMotive: "Sells information to the Ashen Hand", mood: "wary" }],
      readAloud: `You push through the undergrowth into ${dmPrompt}.`,
      canonNotes: ["Assumed this place lies within the party's current region."],
    };
  },
  npcCard: (ctx) => {
    const { campaign, npcId, situation } = ctx as NpcCardInput;
    const npc = campaign.world.npcs.find((n) => n.id === npcId);
    if (!npc) return { openingLine: "…", voiceCue: "", mannerisms: [], wants: "", secretAgenda: "", historyWithParty: "", currentMood: "calm", knows: [], sampleLines: [] };
    return {
      openingLine: npc.voice.catchphrases[0] ?? `${npc.name} sizes you up. "Well?"`,
      voiceCue: moodVoiceDirective(npc.voice, npc.mood),
      mannerisms: npc.mannerisms.length ? npc.mannerisms : ["holds eye contact a beat too long"],
      wants: npc.motive || "To get through the day.",
      secretAgenda: npc.secretMotive,
      historyWithParty: npc.memories.map((m) => m.summary).join(" ") || "Has not met the party before.",
      currentMood: situation?.includes("accus") ? "hostile" : npc.mood,
      knows: campaign.world.facts.filter((f) => f.relatedNpcIds.includes(npc.id)).map((f) => f.statement),
      sampleLines: [`"${npc.name} doesn't do favours. ${npc.name} does trades."`, ...npc.voice.catchphrases],
    };
  },
  shopInventory: (ctx) => {
    const input = ctx as ShopInput;
    const base = shopGenerator.fallback(input);
    return {
      shopName: `The ${titleCase(input.shopKind)} of ${input.settlementSize === "city" ? "Ninefold Street" : "the Crossroads"}`,
      description: "Cramped, well-swept, every shelf labelled in a careful hand.",
      keeperLine: "Touch it, you've bought it.",
      items: base.items.map((i) => ({ ...i, description: i.description || `A ${i.name.toLowerCase()} of honest make.` })),
    };
  },
  encounterProposal: (ctx) => {
    const input = ctx as EncounterInput;
    const band = targetXpBand(input.rules, input.campaign.party, input.difficulty);
    const candidates = candidateStatBlocks(input).sort((a, b) => b.cr - a.cr);
    const mid = (band.min + band.max) / 2;
    const lead = candidates.find((s) => xpForCr(input.rules, s.cr) <= mid / 2) ?? candidates[candidates.length - 1];
    if (!lead) return { name: "Nothing", narrative: "", monsters: [{ statBlockId: "unknown", count: 1 }], tactics: "", twist: "" };
    const count = Math.max(1, Math.min(8, Math.round(mid / xpForCr(input.rules, lead.cr))));
    return {
      name: `${lead.name} ambush`,
      narrative: `${count} ${lead.name}(s) have been shadowing the party since the last town.`,
      monsters: [{ statBlockId: lead.id, count }],
      tactics: lead.tactics || "Strike from cover, then close.",
      twist: "One of them carries a letter naming the party.",
    };
  },
  difficultyLevers: (ctx) => {
    const input = ctx as LeversInput;
    return { levers: baselineLevers(input).map((l) => ({ id: l.id, title: l.title, narrative: `${l.narrative} (tailored)`, cost: l.cost, mechanicalEffect: l.mechanicalEffect })) };
  },
  sessionBrief: (ctx) => {
    const { campaign, rules } = ctx as BriefInput;
    const d = buildSessionBriefData(campaign, rules);
    return {
      headline: `Session ${d.nextSessionNumber}: ${d.activeThreads[0]?.title ?? "Onward"}`,
      whereWeLeftOff: d.lastSessionSummary,
      threads: d.activeThreads.map((t) => ({ title: t.title, nextBeat: t.hooks[0] ?? "Escalate." })),
      pcDebriefs: d.pcDebriefs.map((p) => ({ pcId: p.pcId, name: p.name, notes: `${p.openGoals.join("; ") || "No open goals"}. Spotlight ${p.spotlight.deficit > 0.05 ? "owed" : "fine"}.` })),
      consequencesToSurface: d.dueConsequences.map((c) => c.description),
      balanceWarnings: d.balanceFlags.map((b) => `${b.encounterName}: ${b.flag.message}`),
      openingScene: `Open at ${d.currentLocationPath || "the last scene"}, morning after.`,
      spotlightPlan: d.spotlightForecast.slice(0, 2).map((f) => ({ pcId: f.pcId, how: `A scene for ${f.name}.` })),
    };
  },
  playerRecap: (ctx) => {
    const { campaign, sessionId } = ctx as RecapInput;
    return { recap: buildPlayerRecap(campaign, sessionId), teaser: "Something stirs beneath the old stones." };
  },
  tacticalAdvice: (ctx) => {
    const { combat, statBlocks } = ctx as TacticsInput;
    return { suggestions: suggestTactics(combat, statBlocks) };
  },
  canonCheck: (ctx) => {
    const { campaign, proposedText } = ctx as { campaign: Campaign; proposedText: string };
    const dead = campaign.world.npcs.filter((n) => n.status === "dead" && proposedText.toLowerCase().includes(n.name.toLowerCase()));
    return { contradictions: dead.map((n) => ({ claim: `${n.name} appears`, conflictsWith: `${n.name} is dead`, severity: "high", suggestion: "Make it a memory, a letter, or undead." })) };
  },
};

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
