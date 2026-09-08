/**
 * Versioned campaign schema. See docs/GLOSSARY.md for the meaning of each term.
 *
 * Every save file carries `schemaVersion`. Bump SCHEMA_VERSION and add a step in
 * migrations.ts whenever a breaking shape change is made.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 2 as const;

// ---------- Primitives ----------
export const IdSchema = z.string().min(1);
export const IsoDateSchema = z.string().min(1);

export const ItemCategorySchema = z.enum([
  "weapon",
  "armor",
  "adventuring-gear",
  "tool",
  "potion",
  "scroll",
  "magic-item",
  "trade-good",
  "food-lodging",
  "mount-vehicle",
  "service",
  "treasure",
  "other",
]);
export type ItemCategory = z.infer<typeof ItemCategorySchema>;

export const RaritySchema = z.enum(["common", "uncommon", "rare", "very-rare", "legendary"]);
export type Rarity = z.infer<typeof RaritySchema>;

export const ItemSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  category: ItemCategorySchema.default("other"),
  quantity: z.number().int().min(0).default(1),
  valueGp: z.number().min(0).default(0),
  rarity: RaritySchema.optional(),
  notes: z.string().default(""),
});
export type Item = z.infer<typeof ItemSchema>;

// ---------- Party ----------
export const SpellSlotSchema = z.object({
  level: z.number().int().min(1).max(9),
  max: z.number().int().min(0),
  used: z.number().int().min(0),
});
export type SpellSlot = z.infer<typeof SpellSlotSchema>;

/** A named limited-use resource (Rage, Channel Divinity, Hit Dice, Ki...). */
export const NamedResourceSchema = z.object({
  name: z.string().min(1),
  max: z.number().int().min(0),
  used: z.number().int().min(0),
  recharge: z.enum(["short-rest", "long-rest", "dawn", "other"]).default("long-rest"),
});
export type NamedResource = z.infer<typeof NamedResourceSchema>;

export const GoalSchema = z.object({
  id: IdSchema,
  text: z.string().min(1),
  status: z.enum(["open", "progressing", "resolved", "abandoned"]).default("open"),
  secret: z.boolean().default(false),
  relatedThreadIds: z.array(IdSchema).default([]),
});
export type Goal = z.infer<typeof GoalSchema>;

export const SpotlightEntrySchema = z.object({
  sessionId: IdSchema,
  /** 0..1 share of narrative focus this PC had in that session (DM-estimated or event-derived). */
  weight: z.number().min(0).max(1),
  note: z.string().default(""),
});
export type SpotlightEntry = z.infer<typeof SpotlightEntrySchema>;

export const PlayerCharacterSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  playerName: z.string().default(""),
  className: z.string().default(""),
  species: z.string().default(""),
  level: z.number().int().min(1).max(20).default(1),
  xp: z.number().int().min(0).default(0),
  maxHp: z.number().int().min(1).default(10),
  currentHp: z.number().int().min(0).default(10),
  tempHp: z.number().int().min(0).default(0),
  armorClass: z.number().int().min(1).default(10),
  passivePerception: z.number().int().min(1).default(10),
  gold: z.number().min(0).default(0),
  inventory: z.array(ItemSchema).default([]),
  spellSlots: z.array(SpellSlotSchema).default([]),
  resources: z.array(NamedResourceSchema).default([]),
  goals: z.array(GoalSchema).default([]),
  /** Fact ids this PC (and its player) knows privately. */
  privateKnowledge: z.array(IdSchema).default([]),
  spotlight: z.array(SpotlightEntrySchema).default([]),
  notes: z.string().default(""),
  tags: z.array(z.string()).default([]),
});
export type PlayerCharacter = z.infer<typeof PlayerCharacterSchema>;

export const PartySchema = z.object({
  members: z.array(PlayerCharacterSchema).default([]),
  sharedGold: z.number().min(0).default(0),
  sharedInventory: z.array(ItemSchema).default([]),
  /** Where the party currently is. */
  currentLocationId: IdSchema.optional(),
});
export type Party = z.infer<typeof PartySchema>;

// ---------- World ----------
export const LocationKindSchema = z.enum([
  "region",
  "city",
  "town",
  "village",
  "district",
  "building",
  "room",
  "wilderness",
  "dungeon",
  "landmark",
]);
export type LocationKind = z.infer<typeof LocationKindSchema>;

export const SettlementSizeSchema = z.enum(["hamlet", "village", "town", "city", "metropolis"]);
export type SettlementSize = z.infer<typeof SettlementSizeSchema>;

export const LocationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  kind: LocationKindSchema,
  parentId: IdSchema.optional(),
  description: z.string().default(""),
  /** Backstage details players should not hear verbatim. */
  secretNotes: z.string().default(""),
  settlementSize: SettlementSizeSchema.optional(),
  hooks: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  discoveredByParty: z.boolean().default(false),
  /** True when the AI generated it live (off-script) and the DM has not yet reviewed it. */
  provisional: z.boolean().default(false),
});
export type Location = z.infer<typeof LocationSchema>;

export const FactionSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  goals: z.array(z.string()).default([]),
  /** -100 (hostile) .. 100 (devoted) toward the party. */
  reputation: z.number().min(-100).max(100).default(0),
  relationships: z
    .array(
      z.object({
        factionId: IdSchema,
        stance: z.enum(["allied", "friendly", "neutral", "rival", "hostile"]),
        note: z.string().default(""),
      }),
    )
    .default([]),
  secret: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});
export type Faction = z.infer<typeof FactionSchema>;

export const VoiceProfileSchema = z.object({
  pitch: z.enum(["very-low", "low", "medium", "high", "very-high"]).default("medium"),
  pace: z.enum(["slow", "measured", "brisk", "rapid"]).default("measured"),
  texture: z.string().default(""),
  accent: z.string().default(""),
  catchphrases: z.array(z.string()).default([]),
  /** Free-form performance notes, e.g. "clips consonants when lying". */
  notes: z.string().default(""),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

export const NpcMoodSchema = z.enum([
  "calm",
  "warm",
  "wary",
  "hostile",
  "afraid",
  "grieving",
  "elated",
  "scheming",
  "bored",
  "desperate",
]);
export type NpcMood = z.infer<typeof NpcMoodSchema>;

export const NpcMemorySchema = z.object({
  sessionId: IdSchema.optional(),
  eventId: IdSchema.optional(),
  summary: z.string().min(1),
  /** -1 (grudge) .. 1 (gratitude). */
  sentiment: z.number().min(-1).max(1).default(0),
  createdAt: IsoDateSchema,
});
export type NpcMemory = z.infer<typeof NpcMemorySchema>;

export const StatBlockActionSchema = z.object({
  name: z.string().min(1),
  text: z.string().min(1),
});

export const StatBlockSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  /** Challenge rating as a number: 0, 0.125, 0.25, 0.5, 1..30. */
  cr: z.number().min(0).max(30),
  size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).default("medium"),
  type: z.string().default("humanoid"),
  armorClass: z.number().int().min(1),
  hitPoints: z.number().int().min(1),
  speed: z.string().default("30 ft."),
  abilities: z
    .object({
      str: z.number().int(),
      dex: z.number().int(),
      con: z.number().int(),
      int: z.number().int(),
      wis: z.number().int(),
      cha: z.number().int(),
    })
    .optional(),
  traits: z.array(StatBlockActionSchema).default([]),
  actions: z.array(StatBlockActionSchema).default([]),
  bonusActions: z.array(StatBlockActionSchema).default([]),
  reactions: z.array(StatBlockActionSchema).default([]),
  tactics: z.string().default(""),
  source: z.string().default("custom"),
  tags: z.array(z.string()).default([]),
});
export type StatBlock = z.infer<typeof StatBlockSchema>;

export const NpcSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  role: z.string().default(""),
  locationId: IdSchema.optional(),
  factionId: IdSchema.optional(),
  appearance: z.string().default(""),
  personality: z.string().default(""),
  mannerisms: z.array(z.string()).default([]),
  voice: VoiceProfileSchema.prefault({}),
  /** What the NPC openly wants. */
  motive: z.string().default(""),
  /** Backstage motive; never appears in player-safe output. */
  secretMotive: z.string().default(""),
  mood: NpcMoodSchema.default("calm"),
  /** -100 (hates the party) .. 100 (devoted ally). */
  relationshipToParty: z.number().min(-100).max(100).default(0),
  memories: z.array(NpcMemorySchema).default([]),
  status: z.enum(["alive", "dead", "missing", "unknown"]).default("alive"),
  statBlockId: IdSchema.optional(),
  /** Keys into the asset cache; empty until first generated. */
  assets: z
    .object({
      voiceSampleKey: z.string().optional(),
      portraitKey: z.string().optional(),
    })
    .default({}),
  secret: z.boolean().default(false),
  provisional: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
});
export type Npc = z.infer<typeof NpcSchema>;

export const PlotThreadSchema = z.object({
  id: IdSchema,
  title: z.string().min(1),
  summary: z.string().default(""),
  status: z.enum(["active", "dormant", "resolved"]).default("active"),
  hooks: z.array(z.string()).default([]),
  involvedNpcIds: z.array(IdSchema).default([]),
  involvedFactionIds: z.array(IdSchema).default([]),
  involvedPcIds: z.array(IdSchema).default([]),
  /** Backstage-only threads (the party does not know this thread exists). */
  secret: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});
export type PlotThread = z.infer<typeof PlotThreadSchema>;

/** A single objective truth about the world. Fog of knowledge references facts by id. */
export const FactSchema = z.object({
  id: IdSchema,
  statement: z.string().min(1),
  /** Backstage truth; only surfaces to players when revealed. */
  secret: z.boolean().default(true),
  relatedNpcIds: z.array(IdSchema).default([]),
  relatedLocationIds: z.array(IdSchema).default([]),
  relatedThreadIds: z.array(IdSchema).default([]),
  tags: z.array(z.string()).default([]),
});
export type Fact = z.infer<typeof FactSchema>;

export const ShopItemSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  category: ItemCategorySchema,
  basePriceGp: z.number().min(0),
  priceGp: z.number().min(0),
  stock: z.number().int().min(0),
  rarity: RaritySchema.default("common"),
  description: z.string().default(""),
});
export type ShopItem = z.infer<typeof ShopItemSchema>;

export const ShopSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  kind: z.string().default("general"),
  locationId: IdSchema.optional(),
  ownerNpcId: IdSchema.optional(),
  inventory: z.array(ShopItemSchema).default([]),
  /** Overall markup multiplier applied when generated; kept for diagnostics. */
  markup: z.number().min(0).default(1),
  seed: z.string().default(""),
});
export type Shop = z.infer<typeof ShopSchema>;

export const EncounterMonsterSchema = z.object({
  statBlockId: IdSchema,
  count: z.number().int().min(1),
});

export const EncounterSchema = z.object({
  id: IdSchema,
  name: z.string().min(1),
  locationId: IdSchema.optional(),
  monsters: z.array(EncounterMonsterSchema).default([]),
  notes: z.string().default(""),
  /** Backstage reasoning about why this fight exists. */
  narrative: z.string().default(""),
  status: z.enum(["proposed", "planned", "running", "complete", "discarded"]).default("proposed"),
  tags: z.array(z.string()).default([]),
});
export type Encounter = z.infer<typeof EncounterSchema>;

export const WorldSchema = z.object({
  locations: z.array(LocationSchema).default([]),
  factions: z.array(FactionSchema).default([]),
  npcs: z.array(NpcSchema).default([]),
  statBlocks: z.array(StatBlockSchema).default([]),
  plotThreads: z.array(PlotThreadSchema).default([]),
  facts: z.array(FactSchema).default([]),
  shops: z.array(ShopSchema).default([]),
  encounters: z.array(EncounterSchema).default([]),
  /** Arbitrary quest / world flags. Values are ground truth once set (Principle 3). */
  flags: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).default({}),
});
export type World = z.infer<typeof WorldSchema>;

// ---------- Fog of knowledge ----------
export const KnowledgeSchema = z.object({
  /** Fact ids the party as a whole has discovered. */
  partyKnown: z.array(IdSchema).default([]),
});
export type Knowledge = z.infer<typeof KnowledgeSchema>;

// ---------- Sessions ----------
export const SessionEventKindSchema = z.enum([
  "narrative",
  "combat",
  "choice",
  "discovery",
  "transaction",
  "npc-interaction",
  "override",
  "rest",
  "travel",
  "note",
]);
export type SessionEventKind = z.infer<typeof SessionEventKindSchema>;

export const SessionEventSchema = z.object({
  id: IdSchema,
  at: IsoDateSchema,
  kind: SessionEventKindSchema,
  text: z.string().min(1),
  /** Secret events never reach the player-safe recap. */
  secret: z.boolean().default(false),
  pcIds: z.array(IdSchema).default([]),
  npcIds: z.array(IdSchema).default([]),
  locationId: IdSchema.optional(),
  tags: z.array(z.string()).default([]),
});
export type SessionEvent = z.infer<typeof SessionEventSchema>;

export const SessionSchema = z.object({
  id: IdSchema,
  number: z.number().int().min(1),
  title: z.string().default(""),
  date: IsoDateSchema.optional(),
  status: z.enum(["planned", "live", "complete"]).default("planned"),
  events: z.array(SessionEventSchema).default([]),
  /** Player-facing recap (spoiler-free) the DM may choose to share. */
  playerRecap: z.string().default(""),
  /** DM-only recap including backstage notes. */
  dmRecap: z.string().default(""),
});
export type Session = z.infer<typeof SessionSchema>;

// ---------- Consequences (Principle 4) ----------
export const ConsequenceSchema = z.object({
  id: IdSchema,
  sessionId: IdSchema.optional(),
  eventId: IdSchema.optional(),
  description: z.string().min(1),
  severity: z.enum(["minor", "moderate", "major"]).default("moderate"),
  affectedNpcIds: z.array(IdSchema).default([]),
  affectedFactionIds: z.array(IdSchema).default([]),
  affectedPcIds: z.array(IdSchema).default([]),
  /** Earliest session number at which the AI should start resurfacing this. */
  earliestSessionNumber: z.number().int().min(1).optional(),
  status: z.enum(["pending", "surfaced", "resolved"]).default("pending"),
  surfacedInSessionId: IdSchema.optional(),
  tags: z.array(z.string()).default([]),
});
export type Consequence = z.infer<typeof ConsequenceSchema>;

// ---------- Overrides (Principle 3) ----------
export const OverrideRecordSchema = z.object({
  id: IdSchema,
  at: IsoDateSchema,
  /** Dot path within the campaign, e.g. "party.members.0.currentHp". */
  path: z.string().min(1),
  previous: z.unknown(),
  next: z.unknown(),
  reason: z.string().default(""),
});
export type OverrideRecord = z.infer<typeof OverrideRecordSchema>;

// ---------- Safety & flags ----------
export const SafetyToolsSchema = z.object({
  /** Hard limits: content never appears. */
  lines: z.array(z.string()).default([]),
  /** Soft limits: content may exist off-screen, never described in detail. */
  veils: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type SafetyTools = z.infer<typeof SafetyToolsSchema>;

export const FeatureFlagsSchema = z.record(z.string(), z.boolean());
export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const KNOWN_FEATURE_FLAGS = {
  timeline: "Auto-generated campaign timeline",
  factionMap: "Faction relationship map",
  lootLog: "Loot & transaction log",
  voiceAssets: "NPC voice sample generation",
  portraitAssets: "NPC reference art generation",
  llmCanonCheck: "LLM-assisted canon contradiction check (structural checks are always on)",
} as const;
export type KnownFeatureFlag = keyof typeof KNOWN_FEATURE_FLAGS;

// ---------- Campaign ----------
export const CampaignSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: IdSchema,
  name: z.string().min(1),
  ruleset: z.literal("dnd5e-2024").default("dnd5e-2024"),
  setting: z.string().default(""),
  tone: z.string().default(""),
  houseRules: z.array(z.string()).default([]),
  safety: SafetyToolsSchema.prefault({}),
  featureFlags: FeatureFlagsSchema.default({}),
  party: PartySchema.prefault({}),
  world: WorldSchema.prefault({}),
  knowledge: KnowledgeSchema.prefault({}),
  sessions: z.array(SessionSchema).default([]),
  consequences: z.array(ConsequenceSchema).default([]),
  overrides: z.array(OverrideRecordSchema).default([]),
  createdAt: IsoDateSchema,
  updatedAt: IsoDateSchema,
});
export type Campaign = z.infer<typeof CampaignSchema>;

/** Input shape accepted by createCampaign (all defaults applied). */
export type CampaignInput = z.input<typeof CampaignSchema>;

export function parseCampaign(raw: unknown): Campaign {
  return CampaignSchema.parse(raw);
}

export function safeParseCampaign(raw: unknown): { ok: true; campaign: Campaign } | { ok: false; error: string } {
  const r = CampaignSchema.safeParse(raw);
  if (r.success) return { ok: true, campaign: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
}
