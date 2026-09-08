/**
 * Player-facing recap. HARD BOUNDARY: only the player-safe view enters the
 * prompt, and the output is scanned for backstage leaks before the DM sees it.
 */
import { z } from "zod";
import { buildPlayerRecap, findLeaks, playerSafeView, type Campaign } from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES } from "../prompts.js";

export const PlayerRecapSchema = z.object({
  recap: z.string().min(1),
  /** Optional cliffhanger line, still spoiler-free. */
  teaser: z.string(),
});
export type PlayerRecap = z.infer<typeof PlayerRecapSchema>;

export interface RecapInput {
  campaign: Campaign;
  sessionId: string;
}

export const playerRecapGenerator = defineGenerator<RecapInput, PlayerRecap>({
  name: "playerRecap",
  schema: PlayerRecapSchema,
  summarizeInput: (i) => ({ sessionId: i.sessionId }),
  buildPrompt({ campaign, sessionId }) {
    const view = playerSafeView(campaign, sessionId);
    const session = campaign.sessions.find((s) => s.id === sessionId);
    const user = [
      `Campaign: ${campaign.name}${campaign.tone ? ` (tone: ${campaign.tone})` : ""}`,
      `Write a spoiler-free recap of session ${session?.number ?? "?"}${session?.title ? ` "${session.title}"` : ""} that the DM can post to players.`,
      "Use ONLY the events below. Do not add motives, reveals, or anything not listed. Second person plural (you), past tense, 120-220 words.",
      "",
      "Events the players witnessed:",
      ...view.events.map((e) => `- ${e.text}`),
      "",
      view.facts.length ? `Things the party knows: ${view.facts.map((f) => f.statement).join(" | ")}` : "",
      view.npcs.length ? `People they met: ${view.npcs.map((n) => `${n.name}${n.role ? ` (${n.role})` : ""}`).join(", ")}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { system: PRINCIPLES, user, maxTokens: 1200, effort: "medium" };
  },
  postValidate(output, { campaign, sessionId }) {
    const issues: string[] = [];
    const leaks = findLeaks(output.recap + " " + output.teaser, campaign);
    if (leaks.length === 0) return { output, issues };
    issues.push(`Backstage leak detected (${leaks.length} term(s)); leaking sentences removed`);
    const clean = (text: string) =>
      text
        .split(/(?<=[.!?])\s+/)
        .filter((s) => findLeaks(s, campaign).length === 0)
        .join(" ")
        .trim();
    let recap = clean(output.recap);
    const teaser = clean(output.teaser);
    if (!recap) {
      issues.push("Recap was entirely removed; deterministic recap used");
      recap = buildPlayerRecap(campaign, sessionId);
    }
    return { output: { recap, teaser }, issues };
  },
  fallback({ campaign, sessionId }) {
    return { recap: buildPlayerRecap(campaign, sessionId), teaser: "" };
  },
});
