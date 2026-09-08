import { z } from "zod";
import { suggestTactics, type Campaign, type CombatState, type EncounterRead, type StatBlock } from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame } from "../prompts.js";

export const TacticsSchema = z.object({
  suggestions: z.array(z.object({ combatantId: z.string(), text: z.string().min(1) })).max(12),
});
export type Tactics = z.infer<typeof TacticsSchema>;

export interface TacticsInput {
  campaign: Campaign;
  combat: CombatState;
  statBlocks: StatBlock[];
  read: EncounterRead;
}

export const tacticsGenerator = defineGenerator<TacticsInput, Tactics>({
  name: "tacticalAdvice",
  schema: TacticsSchema,
  summarizeInput: (i) => ({ round: i.combat.round, combatants: i.combat.combatants.length }),
  buildPrompt({ campaign, combat, statBlocks, read }) {
    const monsters = combat.combatants.filter((c) => c.kind === "monster" && c.hp > 0);
    const user = [
      campaignFrame(campaign),
      "",
      `Round ${combat.round}. Fight reads ${read.difficultyNow} now.`,
      "Board:",
      ...combat.combatants.map((c) => `- ${c.kind}:${c.id} ${c.name} HP ${c.hp}/${c.maxHp} AC ${c.armorClass}${c.conditions.length ? ` [${c.conditions.join(", ")}]` : ""}`),
      "",
      "Enemy stat blocks:",
      ...monsters.map((m) => {
        const sb = statBlocks.find((s) => s.id === m.refId);
        return `- ${m.id}: ${sb?.name ?? m.name}; traits: ${sb?.traits.map((t) => t.name).join(", ") || "none"}; actions: ${sb?.actions.map((a) => a.name).join(", ") || "none"}; tactics: ${sb?.tactics || "none"}; tags ${sb?.tags.join(",") || "none"}`;
      }),
      "",
      "Rules-engine suggestions:",
      ...suggestTactics(combat, statBlocks).map((s) => `- ${s.combatantId}: ${s.text}`),
      "",
      "For each living enemy give one line of what it does this round, in character with its stat block. Use combatant ids. Never change stats.",
    ].join("\n");
    return { system: PRINCIPLES, user, maxTokens: 1200, effort: "low" };
  },
  postValidate(output, { combat }) {
    const ids = new Set(combat.combatants.map((c) => c.id));
    const issues: string[] = [];
    const suggestions = output.suggestions.filter((s) => ids.has(s.combatantId) || (issues.push(`Dropped suggestion for unknown combatant "${s.combatantId}"`), false));
    return { output: { suggestions }, issues };
  },
  fallback({ combat, statBlocks }) {
    return { suggestions: suggestTactics(combat, statBlocks) };
  },
});
