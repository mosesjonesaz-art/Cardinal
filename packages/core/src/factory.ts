/** Helpers to build valid campaign objects with defaults applied. */
import { newId } from "./ids.js";
import { CampaignSchema, SCHEMA_VERSION, type Campaign, type CampaignInput } from "./schema.js";

export function createCampaign(input: Partial<Omit<CampaignInput, "schemaVersion">> & { name: string }, now = new Date().toISOString()): Campaign {
  return CampaignSchema.parse({
    id: newId("cmp"),
    createdAt: now,
    updatedAt: now,
    ...input,
    schemaVersion: SCHEMA_VERSION,
  });
}
