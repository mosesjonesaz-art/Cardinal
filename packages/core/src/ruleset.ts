/**
 * Ruleset configuration schema. All ruleset math lives in DATA that satisfies
 * this schema (see packages/rules-5e-2024/data), never in logic. Patching errata
 * or house rules means editing JSON, not code.
 */
import { z } from "zod";
import { ItemCategorySchema, RaritySchema, SettlementSizeSchema, StatBlockSchema } from "./schema.js";

export const DifficultyBudgetSchema = z.object({
  low: z.number().min(0),
  moderate: z.number().min(0),
  high: z.number().min(0),
});
export type DifficultyBudget = z.infer<typeof DifficultyBudgetSchema>;

export const ResourceScalingSchema = z.object({
  /** Weight of hit-point fraction in the party-strength factor. */
  hpWeight: z.number().min(0),
  /** Weight of spell-slot fraction. */
  slotWeight: z.number().min(0),
  /** Weight of other named resources (Rage, Ki, Hit Dice...). */
  resourceWeight: z.number().min(0),
  /** Strength factor never drops below this (a battered party is still a party). */
  floor: z.number().min(0).max(1),
  /** Strength factor never exceeds this. */
  ceiling: z.number().min(1),
});

export const EncounterConfigSchema = z.object({
  /** XP budget per character, keyed by character level ("1".."20"). */
  xpBudgetPerCharacter: z.record(z.string(), DifficultyBudgetSchema),
  /** XP value by challenge rating key: "0", "1/8", "1/4", "1/2", "1".."30". */
  crXp: z.record(z.string(), z.number().min(0)),
  /** Encounters above high * deadlyMultiplier are flagged "deadly" (Cardinal extension, editable). */
  deadlyMultiplier: z.number().min(1),
  /** Encounters below low * trivialFraction are flagged "trivial". */
  trivialFraction: z.number().min(0).max(1),
  resourceScaling: ResourceScalingSchema,
  /** 2024 rules removed the multi-monster multiplier; keep configurable for house rules. */
  monsterCountMultiplier: z.array(z.object({ upToCount: z.number().int().min(1), multiplier: z.number().min(0) })),
});
export type EncounterConfig = z.infer<typeof EncounterConfigSchema>;

export const ProgressionConfigSchema = z.object({
  /** XP required to reach level index+1 (index 0 = level 1 = 0 XP). Exactly 20 entries. */
  levelXpThresholds: z.array(z.number().min(0)).length(20),
  /** Proficiency bonus by level (20 entries). */
  proficiencyBonus: z.array(z.number().int().min(0)).length(20),
});
export type ProgressionConfig = z.infer<typeof ProgressionConfigSchema>;

export const PriceTableEntrySchema = z.object({
  name: z.string().min(1),
  category: ItemCategorySchema,
  basePriceGp: z.number().min(0),
  rarity: RaritySchema.default("common"),
  /** Relative availability weight when rolling inventory. */
  weight: z.number().min(0).default(1),
  /** Smallest settlement where the item can appear. */
  minSettlement: SettlementSizeSchema.default("hamlet"),
  description: z.string().default(""),
});
export type PriceTableEntry = z.infer<typeof PriceTableEntrySchema>;

export const EconomyConfigSchema = z.object({
  settlementModifiers: z.record(
    SettlementSizeSchema,
    z.object({
      priceMultiplier: z.number().min(0),
      maxRarity: RaritySchema,
      inventorySize: z.number().int().min(1),
    }),
  ),
  /** Per-category markup multiplier (1 = list price). */
  categoryMarkups: z.record(ItemCategorySchema, z.number().min(0)),
  /** Linear map from faction reputation -100..100 to a price multiplier max..min. */
  reputationPricing: z.object({ atHostile: z.number().min(0), atDevoted: z.number().min(0) }),
  /** Expected total gold per character at each level (20 entries). Used for wealth bands. */
  expectedGoldPerLevel: z.array(z.number().min(0)).length(20),
  /** Wealth bands compare actual gold/expected gold; first matching band (ascending maxRatio) wins. */
  wealthBands: z.array(
    z.object({ label: z.string(), maxRatio: z.number().min(0), priceMultiplier: z.number().min(0) }),
  ),
  /** Fraction of the party's liquid gold an inventory's total value should target. */
  inventoryValueTarget: z.object({ min: z.number().min(0), max: z.number().min(0) }),
  /** Shop kind -> categories carried. */
  shopKinds: z.record(z.string(), z.array(ItemCategorySchema)),
  priceTable: z.array(PriceTableEntrySchema),
  /** Rounding granularity in gp for displayed prices (e.g. 0.01 = copper precision). */
  priceGranularityGp: z.number().min(0.0001),
});
export type EconomyConfig = z.infer<typeof EconomyConfigSchema>;

export const SpellRefSchema = z.object({
  name: z.string().min(1),
  level: z.number().int().min(0).max(9),
  school: z.string().default(""),
  castingTime: z.string().default(""),
  range: z.string().default(""),
  duration: z.string().default(""),
  summary: z.string().default(""),
  source: z.string().default(""),
});
export type SpellRef = z.infer<typeof SpellRefSchema>;

export const ConditionRefSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
});
export type ConditionRef = z.infer<typeof ConditionRefSchema>;

export const RulesetConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  attribution: z.string().default(""),
  encounter: EncounterConfigSchema,
  progression: ProgressionConfigSchema,
  economy: EconomyConfigSchema,
  monsters: z.array(StatBlockSchema),
  spells: z.array(SpellRefSchema),
  conditions: z.array(ConditionRefSchema),
});
export type RulesetConfig = z.infer<typeof RulesetConfigSchema>;

export function parseRulesetConfig(raw: unknown): RulesetConfig {
  return RulesetConfigSchema.parse(raw);
}

/** Converts a numeric CR to the table key used in crXp ("1/8", "1/4", "1/2", "3"...). */
export function crKey(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(Math.round(cr));
}

export function parseCr(key: string): number {
  const k = key.trim();
  if (k === "1/8") return 0.125;
  if (k === "1/4") return 0.25;
  if (k === "1/2") return 0.5;
  const n = Number(k);
  if (!Number.isFinite(n)) throw new Error(`Unknown CR key: ${key}`);
  return n;
}

export function xpForCr(config: Pick<RulesetConfig, "encounter">, cr: number): number {
  const xp = config.encounter.crXp[crKey(cr)];
  if (xp === undefined) throw new Error(`No XP entry for CR ${crKey(cr)} in ruleset config`);
  return xp;
}

export const RARITY_ORDER: readonly z.infer<typeof RaritySchema>[] = [
  "common",
  "uncommon",
  "rare",
  "very-rare",
  "legendary",
];
export const SETTLEMENT_ORDER: readonly z.infer<typeof SettlementSizeSchema>[] = [
  "hamlet",
  "village",
  "town",
  "city",
  "metropolis",
];
