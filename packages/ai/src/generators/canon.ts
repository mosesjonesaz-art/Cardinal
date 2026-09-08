/** LLM-assisted contradiction check (feature-flagged). Structural checks in core are always on. */
import { z } from "zod";
import { type Campaign } from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame, recentEvents } from "../prompts.js";

export const CanonCheckSchema = z.object({
  contradictions: z
    .array(
      z.object({
        claim: z.string(),
        conflictsWith: z.string(),
        severity: z.enum(["low", "medium", "high"]),
        suggestion: z.string(),
      }),
    )
    .max(10),
});
export type CanonCheck = z.infer<typeof CanonCheckSchema>;

export interface CanonCheckInput {
  campaign: Campaign;
  proposedText: string;
}

export const canonCheckGenerator = defineGenerator<CanonCheckInput, CanonCheck>({
  name: "canonCheck",
  schema: CanonCheckSchema,
  summarizeInput: (i) => ({ length: i.proposedText.length }),
  buildPrompt({ campaign, proposedText }) {
    const user = [
      campaignFrame(campaign),
      "",
      "Established canon:",
      `Locations: ${campaign.world.locations.map((l) => `${l.name} (${l.kind})`).join(", ") || "none"}`,
      `NPCs: ${campaign.world.npcs.map((n) => `${n.name} [${n.status}]`).join(", ") || "none"}`,
      `Facts: ${campaign.world.facts.map((f) => f.statement).join(" | ") || "none"}`,
      `Threads: ${campaign.world.plotThreads.map((t) => `${t.title} [${t.status}]`).join(", ") || "none"}`,
      "Recent events:",
      recentEvents(campaign, 15),
      "",
      "Proposed new content:",
      proposedText,
      "",
      "List contradictions with canon (dead NPCs alive, resolved threads reopened, geography, timeline). Empty list if consistent.",
    ].join("\n");
    return { system: PRINCIPLES, user, maxTokens: 1200, effort: "medium" };
  },
  fallback() {
    return { contradictions: [] };
  },
});
