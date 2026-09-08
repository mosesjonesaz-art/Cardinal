import { z } from "zod";
import {
  classifyDifficulty, createRng, encounterXp, readEncounter, targetXpBand, xpForCr,
  type Campaign, type Difficulty, type EncounterRead, type MonsterGroup, type RulesetConfig, type StatBlock,
} from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame, partySummary, recentEvents } from "../prompts.js";

export const EncounterProposalSchema = z.object({
  name: z.string().min(1),
  /** Why this fight exists in the story (DM only). */
  narrative: z.string(),
  monsters: z.array(z.object({ statBlockId: z.string(), count: z.number().int().min(1).max(20) })).min(1).max(6),
  /** Opening tactics for the enemies. */
  tactics: z.string(),
  /** A non-combat way out or a twist the DM can deploy. */
  twist: z.string(),
});
export type EncounterProposal = z.infer<typeof EncounterProposalSchema>;

export interface EncounterInput {
  campaign: Campaign;
  rules: RulesetConfig;
  difficulty: Exclude<Difficulty, "trivial" | "deadly">;
  locationId?: string;
  theme?: string;
  seed?: string;
}

export function candidateStatBlocks(input: EncounterInput): StatBlock[] {
  const all = [...input.campaign.world.statBlocks, ...input.rules.monsters];
  const band = targetXpBand(input.rules, input.campaign.party, input.difficulty);
  return all.filter((s) => xpForCr(input.rules, s.cr) <= band.max);
}

export function readProposal(input: EncounterInput, proposal: Pick<EncounterProposal, "monsters">): { read: EncounterRead; groups: MonsterGroup[]; missing: string[] } {
  const all = [...input.campaign.world.statBlocks, ...input.rules.monsters];
  const groups: MonsterGroup[] = [];
  const missing: string[] = [];
  for (const m of proposal.monsters) {
    const sb = all.find((s) => s.id === m.statBlockId);
    if (sb) groups.push({ statBlock: sb, count: m.count });
    else missing.push(m.statBlockId);
  }
  return { read: readEncounter(input.rules, input.campaign.party, groups, { missingStatBlocks: missing }), groups, missing };
}

export function encounterFallback(input: EncounterInput): EncounterProposal {
  const rng = createRng(input.seed ?? `${input.campaign.id}:${input.difficulty}`);
  const band = targetXpBand(input.rules, input.campaign.party, input.difficulty);
  const candidates = candidateStatBlocks(input).filter((s) => xpForCr(input.rules, s.cr) > 0);
  if (candidates.length === 0) {
    return { name: "Improvised fight", narrative: "(No stat blocks available.)", monsters: [{ statBlockId: "unknown", count: 1 }], tactics: "", twist: "" };
  }
  const preferred = candidates.filter((s) => xpForCr(input.rules, s.cr) >= band.min / 4);
  const lead = rng.pick(preferred.length ? preferred : candidates);
  const leadXp = xpForCr(input.rules, lead.cr);
  const count = Math.max(1, Math.min(8, Math.floor((band.min + band.max) / 2 / leadXp)));
  const groups: MonsterGroup[] = [{ statBlock: lead, count }];
  const xp = encounterXp(input.rules, groups).adjusted;
  const difficulty = classifyDifficulty(input.rules, xp, band.effectiveBudget);
  return {
    name: `${lead.name}${count > 1 ? "s" : ""} on the road`,
    narrative: `(Generated offline) ${count} × ${lead.name}, ${xp} XP, reads ${difficulty} for the party right now.`,
    monsters: [{ statBlockId: lead.id, count }],
    tactics: lead.tactics || "Straightforward assault.",
    twist: "They can be bargained with if the party offers something they want.",
  };
}

export const encounterGenerator = defineGenerator<EncounterInput, EncounterProposal>({
  name: "encounterProposal",
  schema: EncounterProposalSchema,
  summarizeInput: (i) => ({ difficulty: i.difficulty, locationId: i.locationId, theme: i.theme }),
  buildPrompt(input) {
    const band = targetXpBand(input.rules, input.campaign.party, input.difficulty);
    const candidates = candidateStatBlocks(input);
    const loc = input.locationId ? input.campaign.world.locations.find((l) => l.id === input.locationId) : undefined;
    const user = [
      campaignFrame(input.campaign),
      "",
      `Propose a ${input.difficulty.toUpperCase()} encounter for the party's CURRENT state (resources already accounted for).`,
      `Target total XP between ${band.min} and ${band.max} (sum of monster XP × count; 2024 rules, no group multiplier).`,
      loc ? `Location: ${loc.name} (${loc.kind}). ${loc.description}` : "",
      input.theme ? `Theme: ${input.theme}` : "",
      `Active threads: ${input.campaign.world.plotThreads.filter((t) => t.status === "active").map((t) => t.title).join("; ") || "none"}`,
      "",
      "Party:",
      partySummary(input.campaign),
      "",
      "Available stat blocks (use these ids only):",
      ...candidates.map((s) => `- ${s.id}: ${s.name}, CR ${s.cr}, ${xpForCr(input.rules, s.cr)} XP${s.tags.length ? ` [${s.tags.join(", ")}]` : ""}`),
      "",
      "Recent events:",
      recentEvents(input.campaign, 6),
      "",
      "Return monsters whose XP sums into the target band, a name, a DM-only narrative, opening tactics, and a twist.",
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { system: PRINCIPLES, user, maxTokens: 1500, effort: "medium" };
  },
  postValidate(output, input) {
    const issues: string[] = [];
    const { read, missing } = readProposal(input, output);
    const monsters = output.monsters.filter((m) => !missing.includes(m.statBlockId));
    for (const id of missing) issues.push(`Dropped unknown stat block "${id}"`);
    if (monsters.length === 0) {
      issues.push("No valid monsters; fallback encounter used");
      return { output: encounterFallback(input), issues };
    }
    const band = targetXpBand(input.rules, input.campaign.party, input.difficulty);
    if (read.encounterXp < band.min || read.encounterXp > band.max) {
      issues.push(`Encounter XP ${read.encounterXp} is outside the ${input.difficulty} band ${band.min}–${band.max}; reads ${read.difficultyNow} now`);
    }
    return { output: { ...output, monsters }, issues };
  },
  fallback: encounterFallback,
});
