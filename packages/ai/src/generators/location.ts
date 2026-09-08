import { z } from "zod";
import { consequencesForLocation, locationPath, scanSafety, type Campaign, type Location, type Npc } from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame, npcSummary, partySummary, recentEvents } from "../prompts.js";

export const LocationSceneSchema = z.object({
  /** 2-4 sentences the DM can read or paraphrase aloud. No secrets. */
  readAloud: z.string().min(1),
  ambient: z.array(z.string()).max(6),
  presentNpcs: z.array(z.object({ npcId: z.string(), hook: z.string() })).max(8),
  /** Plot hooks the DM can plant, phrased for the DM. */
  hooks: z.array(z.string()).max(6),
  /** Backstage-only notes: hidden things, secret motives in play, consequences resurfacing. */
  dmNotes: z.array(z.string()).max(8),
});
export type LocationScene = z.infer<typeof LocationSceneSchema>;

export interface LocationSceneInput {
  campaign: Campaign;
  locationId: string;
  /** Optional DM hint: "they arrive at night", "after the fire". */
  hint?: string;
}

function npcsAt(campaign: Campaign, locationId: string): Npc[] {
  return campaign.world.npcs.filter((n) => n.locationId === locationId && n.status !== "dead");
}

export const locationSceneGenerator = defineGenerator<LocationSceneInput, LocationScene>({
  name: "locationScene",
  schema: LocationSceneSchema,
  summarizeInput: (i) => ({ locationId: i.locationId, hint: i.hint }),
  buildPrompt({ campaign, locationId, hint }) {
    const loc = campaign.world.locations.find((l) => l.id === locationId);
    const path = locationPath(campaign, locationId).map((l) => l.name).join(" › ");
    const npcs = npcsAt(campaign, locationId);
    const consequences = consequencesForLocation(campaign, locationId);
    const user = [
      campaignFrame(campaign),
      "",
      `The party moves to: ${path || loc?.name || locationId}`,
      loc ? `Kind: ${loc.kind}${loc.settlementSize ? ` (${loc.settlementSize})` : ""}` : "",
      loc?.description ? `Established description: ${loc.description}` : "",
      loc?.secretNotes ? `DM-only notes: ${loc.secretNotes}` : "",
      loc?.hooks.length ? `Planted hooks: ${loc.hooks.join("; ")}` : "",
      hint ? `DM hint: ${hint}` : "",
      "",
      "Party:",
      partySummary(campaign),
      "",
      npcs.length ? "NPCs present (use their ids in presentNpcs):" : "No NPCs are recorded here; do not invent named NPCs, describe unnamed locals in ambient instead.",
      ...npcs.map((n) => `- id=${n.id}\n  ${npcSummary(campaign, n, { includeSecrets: true })}`),
      "",
      consequences.length ? `Pending consequences involving people here (resurface where natural):\n${consequences.map((c) => `- ${c.description}`).join("\n")}` : "",
      "",
      "Recent events:",
      recentEvents(campaign, 8),
      "",
      "Write the scene. readAloud must be performable in under 30 seconds and contain nothing from DM-only notes.",
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { system: PRINCIPLES, user, maxTokens: 1500, effort: "low" };
  },
  postValidate(output, { campaign, locationId }) {
    const issues: string[] = [];
    const known = new Set(npcsAt(campaign, locationId).map((n) => n.id));
    const presentNpcs = output.presentNpcs.filter((p) => {
      if (!known.has(p.npcId)) {
        issues.push(`Dropped unknown or absent NPC id "${p.npcId}"`);
        return false;
      }
      return true;
    });
    const safety = scanSafety(output.readAloud + " " + output.ambient.join(" "), campaign.safety);
    let readAloud = output.readAloud;
    if (safety.lines.length) {
      issues.push(`Safety line hit in read-aloud text (${safety.lines.join(", ")}); text replaced with fallback`);
      readAloud = fallbackReadAloud(campaign, locationId);
    }
    if (safety.veils.length) issues.push(`Veil topic mentioned (${safety.veils.join(", ")}); keep it off-screen`);
    return { output: { ...output, presentNpcs, readAloud }, issues };
  },
  fallback({ campaign, locationId }) {
    const loc = campaign.world.locations.find((l) => l.id === locationId);
    return {
      readAloud: fallbackReadAloud(campaign, locationId),
      ambient: [],
      presentNpcs: npcsAt(campaign, locationId).map((n) => ({ npcId: n.id, hook: n.motive || n.role || "present" })),
      hooks: loc?.hooks ?? [],
      dmNotes: [loc?.secretNotes ?? "", ...consequencesForLocation(campaign, locationId).map((c) => `Consequence pending: ${c.description}`)].filter(Boolean),
    };
  },
});

function fallbackReadAloud(campaign: Campaign, locationId: string): string {
  const loc: Location | undefined = campaign.world.locations.find((l) => l.id === locationId);
  if (!loc) return "You arrive. (No description recorded; improvise from the location card.)";
  return loc.description || `You arrive at ${loc.name}. (No description recorded yet.)`;
}
