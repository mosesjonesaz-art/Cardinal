/**
 * Compact fixtures for unit tests and the mock LLM provider. The real 2024
 * numbers live in @cardinal/rules-5e-2024; this ruleset is small on purpose.
 */
import { makeIdFactory } from "./ids.js";
import { parseRulesetConfig, type RulesetConfig } from "./ruleset.js";
import { CampaignSchema, SCHEMA_VERSION, type Campaign } from "./schema.js";
import type { ReducerContext } from "./state.js";

export function makeTestRuleset(): RulesetConfig {
  const budget: Record<string, { low: number; moderate: number; high: number }> = {};
  const rows = [
    [50, 75, 100],
    [100, 150, 200],
    [150, 225, 400],
    [250, 375, 500],
    [500, 750, 1100],
  ];
  for (let l = 1; l <= 20; l++) {
    const r = rows[Math.min(l, rows.length) - 1] as number[];
    budget[String(l)] = { low: r[0] as number, moderate: r[1] as number, high: r[2] as number };
  }
  return parseRulesetConfig({
    id: "test-ruleset",
    name: "Test ruleset",
    version: "0",
    encounter: {
      xpBudgetPerCharacter: budget,
      crXp: { "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800 },
      deadlyMultiplier: 1.5,
      trivialFraction: 0.5,
      monsterCountMultiplier: [{ upToCount: 999, multiplier: 1 }],
      resourceScaling: { hpWeight: 0.6, slotWeight: 0.25, resourceWeight: 0.15, floor: 0.35, ceiling: 1 },
    },
    progression: {
      levelXpThresholds: [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000],
      proficiencyBonus: [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6],
    },
    economy: {
      priceGranularityGp: 0.01,
      settlementModifiers: {
        hamlet: { priceMultiplier: 1.2, maxRarity: "common", inventorySize: 4 },
        village: { priceMultiplier: 1.1, maxRarity: "common", inventorySize: 6 },
        town: { priceMultiplier: 1, maxRarity: "uncommon", inventorySize: 8 },
        city: { priceMultiplier: 1, maxRarity: "rare", inventorySize: 10 },
        metropolis: { priceMultiplier: 0.95, maxRarity: "very-rare", inventorySize: 12 },
      },
      categoryMarkups: { weapon: 1, armor: 1, "adventuring-gear": 1, tool: 1, potion: 1, scroll: 1, "magic-item": 1, "trade-good": 1, "food-lodging": 1, "mount-vehicle": 1, service: 1, treasure: 0.5, other: 1 },
      reputationPricing: { atHostile: 1.3, atDevoted: 0.85 },
      expectedGoldPerLevel: [50, 100, 200, 350, 600, 900, 1300, 1800, 2500, 3500, 5000, 7000, 9500, 12500, 16000, 20000, 25000, 32000, 40000, 50000],
      wealthBands: [
        { label: "poor", maxRatio: 0.5, priceMultiplier: 0.9 },
        { label: "normal", maxRatio: 1.5, priceMultiplier: 1 },
        { label: "wealthy", maxRatio: 3, priceMultiplier: 1.1 },
        { label: "rich", maxRatio: 1e9, priceMultiplier: 1.25 },
      ],
      inventoryValueTarget: { min: 0.8, max: 3 },
      shopKinds: { general: ["adventuring-gear", "potion", "food-lodging"], smith: ["weapon", "armor"], magic: ["magic-item", "potion"] },
      priceTable: [
        { name: "Dagger", category: "weapon", basePriceGp: 2, weight: 3 },
        { name: "Longsword", category: "weapon", basePriceGp: 15, weight: 2 },
        { name: "Greatsword", category: "weapon", basePriceGp: 50, weight: 1 },
        { name: "Leather Armor", category: "armor", basePriceGp: 10, weight: 2 },
        { name: "Chain Mail", category: "armor", basePriceGp: 75, weight: 1 },
        { name: "Plate Armor", category: "armor", basePriceGp: 1500, weight: 1, minSettlement: "city" },
        { name: "Rope", category: "adventuring-gear", basePriceGp: 1, weight: 3 },
        { name: "Torch", category: "adventuring-gear", basePriceGp: 0.01, weight: 4 },
        { name: "Rations", category: "adventuring-gear", basePriceGp: 0.5, weight: 4 },
        { name: "Potion of Healing", category: "potion", basePriceGp: 50, weight: 2 },
        { name: "Ale", category: "food-lodging", basePriceGp: 0.04, weight: 3 },
        { name: "Bag of Holding", category: "magic-item", basePriceGp: 500, rarity: "uncommon", weight: 1, minSettlement: "town" },
        { name: "Ring of Protection", category: "magic-item", basePriceGp: 4000, rarity: "rare", weight: 1, minSettlement: "city" },
      ],
    },
    monsters: [
      { id: "mon_goblin", name: "Goblin", cr: 0.25, armorClass: 15, hitPoints: 7, actions: [{ name: "Scimitar", text: "+4, 1d6+2" }], tactics: "Hit and run.", tags: ["cowardly", "ranged"] },
      { id: "mon_wolf", name: "Wolf", cr: 0.25, type: "beast", armorClass: 13, hitPoints: 11, actions: [{ name: "Bite", text: "+4, 2d4+2" }], tags: ["pack", "cowardly"] },
      { id: "mon_bugbear", name: "Bugbear", cr: 1, armorClass: 16, hitPoints: 27, actions: [{ name: "Morningstar", text: "+4, 2d8+2" }], tags: ["brute"] },
      { id: "mon_ogre", name: "Ogre", cr: 2, size: "large", type: "giant", armorClass: 11, hitPoints: 59, actions: [{ name: "Greatclub", text: "+6, 2d8+4" }], tags: ["brute"] },
      { id: "mon_troll", name: "Troll", cr: 5, size: "large", type: "giant", armorClass: 15, hitPoints: 84, actions: [{ name: "Claw", text: "+7, 2d6+4" }], tags: ["brute"] },
    ],
    spells: [{ name: "Fireball", level: 3, school: "Evocation", summary: "8d6 fire in a 20-ft radius." }],
    conditions: [{ name: "Prone", summary: "Can only crawl." }],
  });
}

export const TEST_NOW = "2026-01-01T00:00:00.000Z";

export function makeTestContext(seed = "t"): ReducerContext {
  let tick = 0;
  const id = makeIdFactory(seed);
  return {
    now: () => new Date(Date.parse(TEST_NOW) + tick++ * 1000).toISOString(),
    id,
  };
}

/** A four-PC level-3 party in a small town with one active thread, a secret, and a dead NPC. */
export function makeTestCampaign(): Campaign {
  return CampaignSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    id: "cmp_test",
    name: "Test Campaign",
    setting: "Frontier valley",
    tone: "grim but hopeful",
    houseRules: ["Critical hits max one die"],
    safety: { lines: ["harm to children"], veils: ["torture"] },
    featureFlags: { timeline: true },
    party: {
      currentLocationId: "loc_town",
      sharedGold: 40,
      members: [
        { id: "pc_ava", name: "Ava", className: "Fighter", level: 3, maxHp: 28, currentHp: 28, armorClass: 17, gold: 60, resources: [{ name: "Second Wind", max: 1, used: 0, recharge: "short-rest" }], goals: [{ id: "g1", text: "Find her missing brother" }], spotlight: [{ sessionId: "ses_1", weight: 0.5 }] },
        { id: "pc_bram", name: "Bram", className: "Wizard", level: 3, maxHp: 17, currentHp: 17, armorClass: 12, gold: 35, spellSlots: [{ level: 1, max: 4, used: 0 }, { level: 2, max: 2, used: 0 }], goals: [{ id: "g2", text: "Recover the stolen grimoire" }], privateKnowledge: ["fact_secret_grimoire"], spotlight: [{ sessionId: "ses_1", weight: 0.2 }] },
        { id: "pc_cass", name: "Cass", className: "Cleric", level: 3, maxHp: 24, currentHp: 24, armorClass: 16, gold: 20, spellSlots: [{ level: 1, max: 4, used: 0 }, { level: 2, max: 2, used: 0 }], resources: [{ name: "Channel Divinity", max: 1, used: 0, recharge: "short-rest" }], spotlight: [{ sessionId: "ses_1", weight: 0.2 }] },
        { id: "pc_dov", name: "Dov", className: "Rogue", level: 3, maxHp: 21, currentHp: 21, armorClass: 15, gold: 15, spotlight: [{ sessionId: "ses_1", weight: 0.1 }] },
      ],
    },
    world: {
      locations: [
        { id: "loc_valley", name: "Greywater Valley", kind: "region", discoveredByParty: true },
        { id: "loc_town", name: "Millbrook", kind: "town", parentId: "loc_valley", settlementSize: "town", description: "A mill town on the river.", secretNotes: "The mayor is in debt to the Ashen Hand.", discoveredByParty: true },
        { id: "loc_inn", name: "The Drowned Rat", kind: "building", parentId: "loc_town", description: "A damp riverside inn.", discoveredByParty: true },
        { id: "loc_ruins", name: "Old Watchtower", kind: "dungeon", parentId: "loc_valley", description: "A crumbling tower on the ridge.", hooks: ["Lights seen at night"] },
      ],
      factions: [
        { id: "fac_hand", name: "Ashen Hand", description: "Smugglers", reputation: -20, secret: true },
        { id: "fac_militia", name: "Millbrook Militia", reputation: 15, relationships: [{ factionId: "fac_hand", stance: "hostile" }] },
      ],
      npcs: [
        { id: "npc_mara", name: "Mara Tell", role: "innkeeper", locationId: "loc_inn", motive: "Keep the inn afloat", secretMotive: "Launders coin for the Ashen Hand", mood: "warm", relationshipToParty: 20, voice: { pitch: "low", pace: "brisk", texture: "smoky", catchphrases: ["Mind the step."] }, mannerisms: ["wipes the same glass"], memories: [{ summary: "The party paid for the broken chair.", sentiment: 0.4, createdAt: "2026-01-01T00:00:00.000Z" }] },
        { id: "npc_orrin", name: "Captain Orrin", role: "militia captain", locationId: "loc_town", factionId: "fac_militia", motive: "Keep order", mood: "wary" },
        { id: "npc_ghost", name: "Old Wick", role: "hermit", locationId: "loc_ruins", status: "dead" },
        { id: "npc_villain", name: "The Cinder Priest", role: "cult leader", factionId: "fac_hand", secret: true, secretMotive: "Wake the thing under the tower" },
      ],
      statBlocks: [],
      plotThreads: [
        { id: "thr_tower", title: "Lights in the Watchtower", summary: "Someone is using the ruins at night.", status: "active", involvedNpcIds: ["npc_villain"], involvedFactionIds: ["fac_hand"], secret: false },
        { id: "thr_done", title: "The Broken Chair", status: "resolved", secret: false },
      ],
      facts: [
        { id: "fact_public", statement: "The river floods every spring.", secret: false },
        { id: "fact_secret_grimoire", statement: "The grimoire was sold to the Cinder Priest.", secret: true },
        { id: "fact_backstage", statement: "The mayor owes the Ashen Hand 500 gp.", secret: true },
      ],
      shops: [],
      encounters: [
        { id: "enc_goblins", name: "Goblin ambush", locationId: "loc_ruins", monsters: [{ statBlockId: "mon_goblin", count: 4 }], status: "planned" },
        { id: "enc_ogre", name: "The Ogre's toll", monsters: [{ statBlockId: "mon_ogre", count: 1 }, { statBlockId: "mon_goblin", count: 2 }], status: "planned" },
      ],
      flags: { "quest.tower.started": true },
    },
    knowledge: { partyKnown: [] },
    sessions: [
      {
        id: "ses_1",
        number: 1,
        title: "Arrival",
        status: "complete",
        events: [
          { id: "evt_1", at: "2026-01-01T01:00:00.000Z", kind: "narrative", text: "The party arrived in Millbrook at dusk.", pcIds: ["pc_ava", "pc_bram", "pc_cass", "pc_dov"], locationId: "loc_town" },
          { id: "evt_2", at: "2026-01-01T01:10:00.000Z", kind: "npc-interaction", text: "Mara Tell offered rooms at the Drowned Rat.", npcIds: ["npc_mara"], pcIds: ["pc_ava"], locationId: "loc_inn" },
          { id: "evt_3", at: "2026-01-01T01:20:00.000Z", kind: "choice", text: "Ava threatened the drunk who insulted Cass.", pcIds: ["pc_ava", "pc_cass"], tags: ["insult"] },
          { id: "evt_4", at: "2026-01-01T01:30:00.000Z", kind: "note", text: "The Cinder Priest watched from the rafters.", secret: true, npcIds: ["npc_villain"] },
        ],
      },
    ],
    consequences: [
      { id: "csq_1", sessionId: "ses_1", eventId: "evt_3", description: "The drunk (Militia reservist) tells Captain Orrin the party is trouble.", severity: "minor", affectedNpcIds: ["npc_orrin"], affectedFactionIds: ["fac_militia"], affectedPcIds: ["pc_ava"], earliestSessionNumber: 2 },
    ],
    overrides: [],
    createdAt: TEST_NOW,
    updatedAt: TEST_NOW,
  });
}
