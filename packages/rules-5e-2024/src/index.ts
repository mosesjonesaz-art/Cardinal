/**
 * D&D 5e (2024 revision) ruleset data for Cardinal.
 *
 * Everything numeric lives in ../data/*.json and is validated against the
 * RulesetConfig schema at load time, so a typo in the data fails loudly at
 * startup instead of silently mis-balancing a fight.
 */
import { parseRulesetConfig, type RulesetConfig } from "@cardinal/core";
import encounter from "../data/encounter.json" with { type: "json" };
import progression from "../data/progression.json" with { type: "json" };
import economy from "../data/economy.json" with { type: "json" };
import monsters from "../data/monsters.json" with { type: "json" };
import spells from "../data/spells.json" with { type: "json" };
import conditions from "../data/conditions.json" with { type: "json" };

const ATTRIBUTION =
  "Monster, spell and equipment summaries are abridged from the System Reference Document 5.2 by Wizards of the Coast LLC, available under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/legalcode). Encounter budgets follow the 2024 Dungeon Master's Guide; verify against your copy.";

function strip<T extends object>(o: T): Omit<T, "_comment"> {
  const { _comment: _c, ...rest } = o as T & { _comment?: string };
  void _c;
  return rest;
}

/** Builds (and validates) the ruleset from the JSON data files. */
export function loadRuleset5e2024(): RulesetConfig {
  return parseRulesetConfig({
    id: "dnd5e-2024",
    name: "Dungeons & Dragons 5th Edition (2024 revision)",
    version: "2024.1",
    attribution: ATTRIBUTION,
    encounter: strip(encounter),
    progression: strip(progression),
    economy: strip(economy),
    monsters,
    spells,
    conditions,
  });
}

/** Singleton instance for app use. */
export const rules5e2024: RulesetConfig = loadRuleset5e2024();
