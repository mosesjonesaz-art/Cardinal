import { z } from "zod";
import { buildSessionBriefData, renderBriefText, type Campaign, type RulesetConfig } from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame } from "../prompts.js";

export const SessionBriefSchema = z.object({
  headline: z.string().min(1),
  whereWeLeftOff: z.string().min(1),
  threads: z.array(z.object({ title: z.string(), nextBeat: z.string() })).max(8),
  pcDebriefs: z.array(z.object({ pcId: z.string(), name: z.string(), notes: z.string() })).max(8),
  consequencesToSurface: z.array(z.string()).max(8),
  balanceWarnings: z.array(z.string()).max(8),
  openingScene: z.string(),
  /** Who should get spotlight and a concrete way to give it. */
  spotlightPlan: z.array(z.object({ pcId: z.string(), how: z.string() })).max(8),
});
export type SessionBrief = z.infer<typeof SessionBriefSchema>;

export interface BriefInput {
  campaign: Campaign;
  rules: RulesetConfig;
}

export const briefGenerator = defineGenerator<BriefInput, SessionBrief>({
  name: "sessionBrief",
  schema: SessionBriefSchema,
  summarizeInput: (i) => ({ campaignId: i.campaign.id, sessions: i.campaign.sessions.length }),
  buildPrompt({ campaign, rules }) {
    const data = buildSessionBriefData(campaign, rules);
    const user = [
      campaignFrame(campaign),
      "",
      "Write the pre-session brief from this structured data (all of it is DM-only). Use pc ids exactly as given.",
      "",
      renderBriefText(data),
      "",
      "Structured details:",
      `PC ids: ${data.pcDebriefs.map((p) => `${p.pcId}=${p.name}`).join(", ")}`,
      `Spotlight forecast (most owed first): ${data.spotlightForecast.map((f) => `${f.pcId} deficit ${f.deficit.toFixed(2)}`).join(", ")}`,
      data.activeThreads.length ? `Threads: ${data.activeThreads.map((t) => `${t.title}: ${t.summary} [hooks: ${t.hooks.join("; ")}]`).join(" || ")}` : "",
      data.likelyNpcs.length ? `Likely NPCs: ${data.likelyNpcs.map((n) => `${n.name} (${n.role}, mood ${n.mood}, secret motive: ${n.secretMotive || "none"})`).join("; ")}` : "",
      "",
      "Keep it scannable: one or two sentences per item.",
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { system: PRINCIPLES, user, maxTokens: 3000, effort: "high" };
  },
  postValidate(output, { campaign }) {
    const ids = new Set(campaign.party.members.map((m) => m.id));
    const issues: string[] = [];
    const pcDebriefs = output.pcDebriefs.filter((d) => ids.has(d.pcId) || (issues.push(`Dropped debrief for unknown pc "${d.pcId}"`), false));
    const spotlightPlan = output.spotlightPlan.filter((d) => ids.has(d.pcId) || (issues.push(`Dropped spotlight plan for unknown pc "${d.pcId}"`), false));
    return { output: { ...output, pcDebriefs, spotlightPlan }, issues };
  },
  fallback({ campaign, rules }) {
    const d = buildSessionBriefData(campaign, rules);
    return {
      headline: `Session ${d.nextSessionNumber}`,
      whereWeLeftOff: d.lastSessionSummary,
      threads: d.activeThreads.map((t) => ({ title: t.title, nextBeat: t.hooks[0] ?? t.summary })),
      pcDebriefs: d.pcDebriefs.map((p) => ({ pcId: p.pcId, name: p.name, notes: `${p.openGoals.join("; ") || "no open goals"}; ${p.privateSecretsCount} private secret(s)` })),
      consequencesToSurface: d.dueConsequences.map((c) => c.description),
      balanceWarnings: d.balanceFlags.map((b) => `${b.encounterName}: ${b.flag.message}`),
      openingScene: d.currentLocationPath ? `Pick up at ${d.currentLocationPath}.` : "Pick up where the log ends.",
      spotlightPlan: d.spotlightForecast.filter((f) => f.deficit > 0.05).map((f) => ({ pcId: f.pcId, how: `Give ${f.name} a scene tied to their goals.` })),
    };
  },
});
