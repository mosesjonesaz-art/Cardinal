/**
 * Schema migrations. Each step upgrades a raw object from version N to N+1.
 * `migrateCampaign` walks from whatever version the file carries up to
 * SCHEMA_VERSION, then validates with the current schema.
 */
import { SCHEMA_VERSION, parseCampaign, type Campaign } from "./schema.js";

export type MigrationStep = {
  from: number;
  to: number;
  description: string;
  up: (raw: Record<string, unknown>) => Record<string, unknown>;
};

export const MIGRATIONS: MigrationStep[] = [
  {
    from: 1,
    to: 2,
    description:
      "v2 adds campaign.safety (lines & veils), campaign.featureFlags, campaign.consequences, and moves top-level questFlags into world.flags.",
    up(raw) {
      const world = (raw.world ?? {}) as Record<string, unknown>;
      const questFlags = (raw.questFlags ?? {}) as Record<string, unknown>;
      const { questFlags: _dropped, ...rest } = raw;
      void _dropped;
      return {
        ...rest,
        schemaVersion: 2,
        safety: raw.safety ?? { lines: [], veils: [], notes: "" },
        featureFlags: raw.featureFlags ?? {},
        consequences: raw.consequences ?? [],
        world: { ...world, flags: { ...(world.flags as Record<string, unknown> | undefined), ...questFlags } },
      };
    },
  },
];

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly fromVersion: number | undefined,
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

export interface MigrationResult {
  campaign: Campaign;
  appliedSteps: string[];
  fromVersion: number;
}

export function migrateCampaign(raw: unknown): MigrationResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new MigrationError("Save file is not an object", undefined);
  }
  let current = { ...(raw as Record<string, unknown>) };
  const startVersion = typeof current.schemaVersion === "number" ? current.schemaVersion : 1;
  if (startVersion > SCHEMA_VERSION) {
    throw new MigrationError(
      `Save file schema v${startVersion} is newer than this app supports (v${SCHEMA_VERSION}). Update the app.`,
      startVersion,
    );
  }
  const applied: string[] = [];
  let version = startVersion;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === version);
    if (!step) throw new MigrationError(`No migration path from schema v${version}`, startVersion);
    current = step.up(current);
    applied.push(`v${step.from}→v${step.to}: ${step.description}`);
    version = step.to;
  }
  current.schemaVersion = SCHEMA_VERSION;
  return { campaign: parseCampaign(current), appliedSteps: applied, fromVersion: startVersion };
}
