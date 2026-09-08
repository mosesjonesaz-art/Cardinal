/**
 * Off-script handling: the party goes somewhere unplanned. Generates a coherent
 * location (and optionally NPCs) from canon, returned as PROVISIONAL records the
 * DM reviews before they become canon.
 */
import { z } from "zod";
import {
  LocationKindSchema, NpcMoodSchema, VoiceProfileSchema, locationPath, newId, scanSafety,
  type Campaign, type Location, type Npc,
} from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame, partySummary, recentEvents } from "../prompts.js";

export const OffScriptSchema = z.object({
  location: z.object({
    name: z.string().min(1),
    kind: LocationKindSchema,
    description: z.string().min(1),
    hooks: z.array(z.string()).max(5),
    secretNotes: z.string(),
  }),
  npcs: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string(),
        appearance: z.string(),
        personality: z.string(),
        mannerisms: z.array(z.string()).max(4),
        voice: VoiceProfileSchema,
        motive: z.string(),
        secretMotive: z.string(),
        mood: NpcMoodSchema,
      }),
    )
    .max(4),
  readAloud: z.string().min(1),
  /** Anything the DM should double-check against canon. */
  canonNotes: z.array(z.string()).max(6),
});
export type OffScriptOutput = z.infer<typeof OffScriptSchema>;

export interface OffScriptInput {
  campaign: Campaign;
  /** What the DM typed/tapped: "they follow the smugglers' trail into the marsh". */
  dmPrompt: string;
  parentLocationId?: string;
}

export const offScriptGenerator = defineGenerator<OffScriptInput, OffScriptOutput>({
  name: "offScript",
  schema: OffScriptSchema,
  summarizeInput: (i) => ({ dmPrompt: i.dmPrompt, parentLocationId: i.parentLocationId }),
  buildPrompt({ campaign, dmPrompt, parentLocationId }) {
    const parent = parentLocationId ? locationPath(campaign, parentLocationId).map((l) => l.name).join(" › ") : "";
    const nearby = campaign.world.locations.filter((l) => l.parentId === parentLocationId).map((l) => l.name);
    const user = [
      campaignFrame(campaign),
      "",
      `The party has gone off-script. DM says: "${dmPrompt}"`,
      parent ? `Within: ${parent}` : "No parent location given; choose a plausible kind.",
      nearby.length ? `Existing sibling locations (do not duplicate): ${nearby.join(", ")}` : "",
      `Existing NPC names (do not reuse): ${campaign.world.npcs.map((n) => n.name).join(", ") || "none"}`,
      `Active threads: ${campaign.world.plotThreads.filter((t) => t.status === "active").map((t) => `${t.title} (${t.summary})`).join("; ") || "none"}`,
      `Factions: ${campaign.world.factions.map((f) => `${f.name} (rep ${f.reputation})`).join("; ") || "none"}`,
      "",
      "Party:",
      partySummary(campaign),
      "",
      "Recent events:",
      recentEvents(campaign, 8),
      "",
      "Generate one coherent location that fits the canon and tone, 0-3 NPCs only if the place would have named people, a short readAloud, and canonNotes listing anything you assumed.",
    ]
      .filter((l) => l !== "")
      .join("\n");
    return { system: PRINCIPLES, user, maxTokens: 2500, effort: "medium" };
  },
  postValidate(output, { campaign }) {
    const issues: string[] = [];
    const names = new Set(campaign.world.npcs.map((n) => n.name.toLowerCase()));
    const npcs = output.npcs.filter((n) => {
      if (names.has(n.name.toLowerCase())) {
        issues.push(`Dropped NPC "${n.name}": name already exists in canon`);
        return false;
      }
      return true;
    });
    if (campaign.world.locations.some((l) => l.name.toLowerCase() === output.location.name.toLowerCase())) {
      issues.push(`Location name "${output.location.name}" already exists; review before approving`);
    }
    const safety = scanSafety([output.readAloud, output.location.description, ...npcs.map((n) => n.motive + n.secretMotive)].join(" "), campaign.safety);
    if (safety.lines.length) issues.push(`Safety line hit (${safety.lines.join(", ")}); review before use`);
    return { output: { ...output, npcs }, issues };
  },
  fallback({ dmPrompt, parentLocationId, campaign }) {
    const parentKind = parentLocationId ? campaign.world.locations.find((l) => l.id === parentLocationId)?.kind : undefined;
    return {
      location: {
        name: dmPrompt.slice(0, 40).trim() || "Unplanned place",
        kind: parentKind === "building" ? "room" : parentKind === "region" || !parentKind ? "landmark" : "building",
        description: `(Generated offline) ${dmPrompt}`,
        hooks: [],
        secretNotes: "",
      },
      npcs: [],
      readAloud: `You arrive. (AI unavailable: improvise from "${dmPrompt}" and fill the card afterwards.)`,
      canonNotes: ["Fallback content: nothing here has been checked against canon."],
    };
  },
});

/** Turns an approved-or-not generation into provisional canon records for the reducer. */
export function offScriptToRecords(output: OffScriptOutput, parentLocationId: string | undefined, id: (prefix?: string) => string = newId): { location: Location; npcs: Npc[] } {
  const location: Location = {
    id: id("loc"),
    name: output.location.name,
    kind: output.location.kind,
    parentId: parentLocationId,
    description: output.location.description,
    secretNotes: output.location.secretNotes,
    hooks: output.location.hooks,
    tags: ["off-script"],
    discoveredByParty: true,
    provisional: true,
  };
  const npcs: Npc[] = output.npcs.map((n) => ({
    id: id("npc"),
    name: n.name,
    role: n.role,
    locationId: location.id,
    appearance: n.appearance,
    personality: n.personality,
    mannerisms: n.mannerisms,
    voice: n.voice,
    motive: n.motive,
    secretMotive: n.secretMotive,
    mood: n.mood,
    relationshipToParty: 0,
    memories: [],
    status: "alive",
    assets: {},
    secret: false,
    provisional: true,
    tags: ["off-script"],
  }));
  return { location, npcs };
}
