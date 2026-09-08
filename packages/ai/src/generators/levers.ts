import { z } from "zod";
import { proposeDifficultyLevers, type Campaign, type DifficultyLever, type EncounterRead, type MonsterGroup, type RulesetConfig } from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame, partySummary } from "../prompts.js";

export const LeversSchema = z.object({
  levers: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().min(1),
        narrative: z.string().min(1),
        cost: z.string().min(1),
        mechanicalEffect: z.string().min(1),
      }),
    )
    .max(8),
});
export type LeversOutput = z.infer<typeof LeversSchema>;

export interface LeversInput {
  campaign: Campaign;
  rules: RulesetConfig;
  read: EncounterRead;
  groups: MonsterGroup[];
  round: number;
  pcsInDanger: number;
  situation?: string;
}

export function baselineLevers(input: LeversInput): DifficultyLever[] {
  return proposeDifficultyLevers(input.rules, { read: input.read, groups: input.groups, pcsInDanger: input.pcsInDanger, round: input.round });
}

export const leversGenerator = defineGenerator<LeversInput, LeversOutput>({
  name: "difficultyLevers",
  schema: LeversSchema,
  summarizeInput: (i) => ({ round: i.round, pcsInDanger: i.pcsInDanger, difficultyNow: i.read.difficultyNow, situation: i.situation }),
  buildPrompt(input) {
    const base = baselineLevers(input);
    const user = [
      campaignFrame(input.campaign),
      "",
      `Mid-combat, round ${input.round}. The fight reads ${input.read.difficultyNow.toUpperCase()} right now (${input.read.encounterXp} XP vs effective budget ${input.read.budgetEffective.low}/${input.read.budgetEffective.moderate}/${input.read.budgetEffective.high}). ${Math.round(input.pcsInDanger * 100)}% of PCs are below 25% HP.`,
      `Enemies: ${input.groups.map((g) => `${g.count} × ${g.statBlock.name}${g.hpFraction !== undefined ? ` (${Math.round(g.hpFraction * 100)}% HP)` : ""}`).join(", ")}`,
      input.situation ? `DM says: ${input.situation}` : "",
      "",
      "Party:",
      partySummary(input.campaign),
      "",
      "Rules-engine lever options (keep the same ids; rewrite narrative/cost/mechanicalEffect to fit this specific fight and campaign; never remove the cost):",
      ...base.map((l) => `- id=${l.id} [${l.direction}] ${l.title}: ${l.narrative} COST: ${l.cost} EFFECT: ${l.mechanicalEffect}`),
      "",
      base.length ? "Return the tailored levers." : "The fight is on target: return an empty levers list.",
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { system: PRINCIPLES, user, maxTokens: 1500, effort: "low" };
  },
  postValidate(output, input) {
    const base = baselineLevers(input);
    const issues: string[] = [];
    const byId = new Map(base.map((l) => [l.id, l]));
    const levers = output.levers.filter((l) => {
      if (!byId.has(l.id)) {
        issues.push(`Dropped lever with unknown id "${l.id}" (no rules-engine cost model)`);
        return false;
      }
      return true;
    });
    for (const l of base) if (!levers.some((x) => x.id === l.id)) levers.push({ id: l.id, title: l.title, narrative: l.narrative, cost: l.cost, mechanicalEffect: l.mechanicalEffect });
    return { output: { levers }, issues };
  },
  fallback(input) {
    return { levers: baselineLevers(input).map((l) => ({ id: l.id, title: l.title, narrative: l.narrative, cost: l.cost, mechanicalEffect: l.mechanicalEffect })) };
  },
});

/** Re-attaches direction and xpDelta from the rules engine so the UI can show the math. */
export function enrichLevers(output: LeversOutput, input: LeversInput): DifficultyLever[] {
  const base = baselineLevers(input);
  return output.levers.flatMap((l) => {
    const b = base.find((x) => x.id === l.id);
    return b ? [{ ...b, title: l.title, narrative: l.narrative, cost: l.cost, mechanicalEffect: l.mechanicalEffect }] : [];
  });
}
