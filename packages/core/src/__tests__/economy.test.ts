import { describe, expect, it } from "vitest";
import { generateShopInventory, partyWealthBand, priceItem, reputationMultiplier, validateShopInventory } from "../index.js";
import { makeTestCampaign, makeTestRuleset } from "../testing.js";

const rules = makeTestRuleset();

describe("pricing", () => {
  it("multiplies base price by every configured modifier", () => {
    const p = priceItem(rules, { basePriceGp: 100, category: "weapon" }, { settlementSize: "hamlet", reputation: 100, wealthMultiplier: 1.1, extraMultiplier: 2 });
    expect(p.settlementMultiplier).toBe(1.2);
    expect(p.reputationMultiplier).toBe(0.85);
    expect(p.priceGp).toBeCloseTo(100 * 1.2 * 0.85 * 1.1 * 2, 2);
  });
  it("maps reputation linearly from hostile to devoted", () => {
    expect(reputationMultiplier(rules, -100)).toBe(1.3);
    expect(reputationMultiplier(rules, 100)).toBe(0.85);
    expect(reputationMultiplier(rules, 0)).toBeCloseTo(1.075, 5);
  });
  it("finds the party's wealth band", () => {
    const c = makeTestCampaign();
    const band = partyWealthBand(rules, c.party);
    expect(band.liquidGold).toBe(170);
    expect(band.expectedGold).toBe(800);
    expect(band.label).toBe("poor");
    const rich = partyWealthBand(rules, { ...c.party, sharedGold: 10000 });
    expect(rich.label).toBe("rich");
  });
});

describe("shop generation", () => {
  it("is deterministic for a seed and respects settlement rarity limits", () => {
    const c = makeTestCampaign();
    const a = generateShopInventory(rules, { seed: "s1", shopKind: "magic", settlementSize: "village", party: c.party });
    const b = generateShopInventory(rules, { seed: "s1", shopKind: "magic", settlementSize: "village", party: c.party });
    expect(a.items).toEqual(b.items);
    expect(a.items.every((i) => i.rarity === "common")).toBe(true);
    const city = generateShopInventory(rules, { seed: "s2", shopKind: "magic", settlementSize: "city", party: { ...c.party, sharedGold: 50000 }, size: 3 });
    expect(city.items.length).toBe(3);
  });
  it("keeps some items affordable for the party and explains itself", () => {
    const c = makeTestCampaign();
    const r = generateShopInventory(rules, { seed: "poor", shopKind: "smith", settlementSize: "town", party: c.party });
    const perPc = 170 / 4;
    expect(r.items.filter((i) => i.priceGp <= perPc).length).toBeGreaterThanOrEqual(2);
    expect(r.explanation.some((l) => l.includes("wealth band"))).toBe(true);
    expect(r.items.every((i) => i.stock >= 1)).toBe(true);
  });
  it("returns an empty inventory with an explanation for unknown shop kinds", () => {
    const c = makeTestCampaign();
    const r = generateShopInventory(rules, { seed: "x", shopKind: "unknown-kind", settlementSize: "town", party: c.party });
    expect(r.items.length).toBeGreaterThan(0); // falls back to "general"
    const none = generateShopInventory({ ...rules, economy: { ...rules.economy, shopKinds: {} } }, { seed: "x", shopKind: "zzz", settlementSize: "town", party: c.party });
    expect(none.items).toEqual([]);
  });
});

describe("AI-boundary inventory validation", () => {
  it("clamps wild prices and drops malformed rows", () => {
    const ctx = { settlementSize: "town" as const, reputation: 0, wealthMultiplier: 1 };
    const expected = priceItem(rules, { basePriceGp: 50, category: "potion" }, ctx).priceGp;
    const { items, issues } = validateShopInventory(rules, [
      { id: "1", name: "Potion of Healing", category: "potion", basePriceGp: 50, priceGp: 5000, stock: 2, rarity: "common", description: "" },
      { id: "2", name: "", category: "potion", basePriceGp: 50, priceGp: 50, stock: 1, rarity: "common", description: "" },
      { id: "3", name: "Mystery Elixir", category: "potion", basePriceGp: 20, priceGp: 22, stock: 1, rarity: "common", description: "" },
    ], ctx);
    expect(items).toHaveLength(2);
    expect(items[0]?.priceGp).toBeCloseTo(expected * 1.5, 2);
    expect(issues).toHaveLength(2);
    expect(items[1]?.priceGp).toBe(22);
  });
});
