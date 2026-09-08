# Editing the rules data

All ruleset math is data in `packages/rules-5e-2024/data/*.json`. Nothing in `packages/core` hardcodes a number from the books. The data is validated against `RulesetConfigSchema` (`packages/core/src/ruleset.ts`) when the app starts, so a typo fails loudly.

| File | Contents | Used by |
|---|---|---|
| `encounter.json` | `xpBudgetPerCharacter` (Low/Moderate/High per level), `crXp`, `deadlyMultiplier`, `trivialFraction`, `monsterCountMultiplier`, `resourceScaling` | `xpBudget`, `encounterXp`, `classifyDifficulty`, `partyStrength` |
| `progression.json` | `levelXpThresholds` (20), `proficiencyBonus` (20) | `levelForXp`, `pendingLevelUps` |
| `economy.json` | settlement modifiers, category markups, reputation pricing, expected gold per level, wealth bands, inventory value target, shop kinds, price table | `priceItem`, `generateShopInventory`, `validateShopInventory` |
| `monsters.json` | Stat blocks (`StatBlock` schema). Tags drive rule-based tactics: `pack`, `ranged`, `brute`, `cunning`, `cowardly`, `fearless`. | Encounter proposals, combat tracker, lookup |
| `spells.json`, `conditions.json` | Quick-reference summaries | Lookup screen |

## Common edits

- **Errata to a budget row**: change the numbers in `encounter.json`; run `pnpm test` (the rules package test checks monotonicity and a few spot values; update the spot values if the book changed).
- **House rule: re-enable the 2014 group multiplier**: set `monsterCountMultiplier` to e.g. `[{"upToCount":1,"multiplier":1},{"upToCount":2,"multiplier":1.5},{"upToCount":6,"multiplier":2},{"upToCount":10,"multiplier":2.5},{"upToCount":14,"multiplier":3},{"upToCount":999,"multiplier":4}]`.
- **Softer "deadly" threshold**: lower `deadlyMultiplier`.
- **How much a depleted party matters**: tune `resourceScaling` (weights and `floor`).
- **New shop kind**: add a key to `shopKinds` listing item categories; add price-table rows with those categories.
- **Campaign-specific goods**: pass `extraEntries` to `generateShopInventory`, or add rows to the price table.
- **Custom monsters**: add to the campaign's `world.statBlocks` (they override ruleset ids) or to `monsters.json`.

## Schema versions

Campaign save files carry `schemaVersion`. When you change `packages/core/src/schema.ts` in a breaking way: bump `SCHEMA_VERSION`, add a step to `MIGRATIONS` in `migrations.ts`, add a test in `schema.test.ts`, and note it in `CHANGELOG.md`.
