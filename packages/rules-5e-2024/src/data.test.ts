import { describe, expect, it } from "vitest";
import { crKey, xpForCr, xpBudget, levelForXp, priceItem } from "@cardinal/core";
import { loadRuleset5e2024, rules5e2024 } from "./index.js";

describe("5e 2024 ruleset data", () => {
  it("validates against the RulesetConfig schema", () => {
    expect(() => loadRuleset5e2024()).not.toThrow();
    expect(rules5e2024.id).toBe("dnd5e-2024");
  });

  it("has a budget row for every level 1..20 and monotonically increasing values", () => {
    for (let l = 1; l <= 20; l++) {
      const row = rules5e2024.encounter.xpBudgetPerCharacter[String(l)];
      expect(row, `level ${l}`).toBeDefined();
      expect(row!.low).toBeLessThanOrEqual(row!.moderate);
      expect(row!.moderate).toBeLessThanOrEqual(row!.high);
    }
    expect(xpBudget(rules5e2024, [1])).toEqual({ low: 50, moderate: 75, high: 100 });
    expect(xpBudget(rules5e2024, [5, 5, 5, 5])).toEqual({ low: 2000, moderate: 3000, high: 4400 });
  });

  it("maps every monster CR to an XP value", () => {
    for (const m of rules5e2024.monsters) expect(() => xpForCr(rules5e2024, m.cr), m.name).not.toThrow();
    expect(xpForCr(rules5e2024, 0.25)).toBe(50);
    expect(xpForCr(rules5e2024, 5)).toBe(1800);
    expect(crKey(0.125)).toBe("1/8");
  });

  it("has unique monster ids", () => {
    const ids = rules5e2024.monsters.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses the standard XP thresholds", () => {
    expect(levelForXp(rules5e2024, 0)).toBe(1);
    expect(levelForXp(rules5e2024, 299)).toBe(1);
    expect(levelForXp(rules5e2024, 300)).toBe(2);
    expect(levelForXp(rules5e2024, 355000)).toBe(20);
  });

  it("prices a Potion of Healing at list price in a town with neutral reputation", () => {
    const p = priceItem(rules5e2024, { basePriceGp: 50, category: "potion" }, { settlementSize: "town", reputation: 0, wealthMultiplier: 1 });
    expect(p.priceGp).toBeCloseTo(50 * ((1.3 + 0.85) / 2), 2);
  });

  it("every shop kind references known categories with at least one item", () => {
    for (const [kind, cats] of Object.entries(rules5e2024.economy.shopKinds)) {
      const items = rules5e2024.economy.priceTable.filter((e) => cats.includes(e.category));
      expect(items.length, kind).toBeGreaterThan(0);
    }
  });
});
