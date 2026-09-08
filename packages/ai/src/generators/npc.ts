import { z } from "zod";
import { NpcMoodSchema, consequencesForNpc, scanSafety, type Campaign } from "@cardinal/core";
import { moodVoiceDirective } from "../assets.js";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame, npcSummary, partySummary, recentEvents } from "../prompts.js";

export const NpcCardSchema = z.object({
  openingLine: z.string().min(1),
  /** One line the DM can read to drop into the voice instantly. */
  voiceCue: z.string().min(1),
  mannerisms: z.array(z.string()).max(4),
  /** What they openly want right now. */
  wants: z.string(),
  /** DM only. */
  secretAgenda: z.string(),
  historyWithParty: z.string(),
  currentMood: NpcMoodSchema,
  /** What they know that the party might ask about (DM only). */
  knows: z.array(z.string()).max(6),
  /** Lines they would say if pushed on key topics. */
  sampleLines: z.array(z.string()).max(4),
});
export type NpcCard = z.infer<typeof NpcCardSchema>;

export interface NpcCardInput {
  campaign: Campaign;
  npcId: string;
  /** Situation hint from the DM, e.g. "the party just accused her". */
  situation?: string;
}

export const npcCardGenerator = defineGenerator<NpcCardInput, NpcCard>({
  name: "npcCard",
  schema: NpcCardSchema,
  summarizeInput: (i) => ({ npcId: i.npcId, situation: i.situation }),
  buildPrompt({ campaign, npcId, situation }) {
    const npc = campaign.world.npcs.find((n) => n.id === npcId);
    const consequences = npc ? consequencesForNpc(campaign, npc.id) : [];
    const facts = npc ? campaign.world.facts.filter((f) => f.relatedNpcIds.includes(npc.id)) : [];
    const user = [
      campaignFrame(campaign),
      "",
      "Embodiment card for this NPC (the DM will perform them in the next few seconds):",
      npc ? npcSummary(campaign, npc, { includeSecrets: true }) : `Unknown NPC ${npcId}`,
      facts.length ? `Facts about them (DM only): ${facts.map((f) => f.statement).join(" | ")}` : "",
      consequences.length ? `Consequences involving them (resurface if natural): ${consequences.map((c) => c.description).join(" | ")}` : "",
      situation ? `Situation right now: ${situation}` : "",
      "",
      "Party:",
      partySummary(campaign),
      "",
      "Recent events:",
      recentEvents(campaign, 8),
      "",
      "Keep every field short. openingLine and sampleLines are in the NPC's own voice.",
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { system: PRINCIPLES, user, maxTokens: 1200, effort: "low" };
  },
  postValidate(output, { campaign }) {
    const issues: string[] = [];
    const safety = scanSafety([output.openingLine, ...output.sampleLines].join(" "), campaign.safety);
    if (safety.lines.length) issues.push(`Safety line hit (${safety.lines.join(", ")}); review the lines before using them`);
    return { output, issues };
  },
  fallback({ campaign, npcId }) {
    const npc = campaign.world.npcs.find((n) => n.id === npcId);
    if (!npc) {
      return { openingLine: "…", voiceCue: "Perform from your notes.", mannerisms: [], wants: "", secretAgenda: "", historyWithParty: "", currentMood: "calm", knows: [], sampleLines: [] };
    }
    return {
      openingLine: npc.voice.catchphrases[0] ?? `${npc.name} looks up.`,
      voiceCue: moodVoiceDirective(npc.voice, npc.mood),
      mannerisms: npc.mannerisms,
      wants: npc.motive,
      secretAgenda: npc.secretMotive,
      historyWithParty: npc.memories.map((m) => m.summary).join(" ") || "No recorded history.",
      currentMood: npc.mood,
      knows: [],
      sampleLines: npc.voice.catchphrases,
    };
  },
});
