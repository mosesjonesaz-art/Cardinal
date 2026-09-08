/**
 * Shop & economy. Prices come from the config's price table and modifiers, so
 * "no manual math" for the DM and no magic numbers in code.
 */
import { createRng } from "./rng.js";
import { RARITY_ORDER, SETTLEMENT_ORDER, type PriceTableEntry, type RulesetConfig } from "./ruleset.js";
import type { ItemCategory, Party, Rarity, SettlementSize, ShopItem } from "./schema.js";

export interface PriceContext {
  settlementSize: SettlementSize;
  /** Reputation of the relevant faction / shopkeeper toward the party, -100..100. */
  reputation: number;
  /** Multiplier from the party's wealth band. */
  wealthMultiplier: number;
  /** Extra multiplier the DM or AI applies (haggling, scarcity). */
  extraMultiplier?: number;
}

export interface PriceBreakdown {
  basePriceGp: number;
  categoryMarkup: number;
  settlementMultiplier: number;
  reputationMultiplier: number;
  wealthMultiplier: number;
  extraMultiplier: number;
  priceGp: number;
}

export function roundPrice(config: RulesetConfig, gp: number): number {
  const g = config.economy.priceGranularityGp;
  return Math.round(gp / g) * g;
}

export function reputationMultiplier(config: RulesetConfig, reputation: number): number {
  const r = Math.min(100, Math.max(-100, reputation));
  const { atHostile, atDevoted } = config.economy.reputationPricing;
  const t = (r + 100) / 200;
  return atHostile + (atDevoted - atHostile) * t;
}

export function priceItem(config: RulesetConfig, entry: { basePriceGp: number; category: ItemCategory }, ctx: PriceContext): PriceBreakdown {
  const categoryMarkup = config.economy.categoryMarkups[entry.category] ?? 1;
  const settlementMultiplier = config.economy.settlementModifiers[ctx.settlementSize]?.priceMultiplier ?? 1;
  const repMult = reputationMultiplier(config, ctx.reputation);
  const extra = ctx.extraMultiplier ?? 1;
  const raw = entry.basePriceGp * categoryMarkup * settlementMultiplier * repMult * ctx.wealthMultiplier * extra;
  return {
    basePriceGp: entry.basePriceGp,
    categoryMarkup,
    settlementMultiplier,
    reputationMultiplier: repMult,
    wealthMultiplier: ctx.wealthMultiplier,
    extraMultiplier: extra,
    priceGp: roundPrice(config, raw),
  };
}

export interface WealthBand {
  label: string;
  multiplier: number;
  liquidGold: number;
  expectedGold: number;
  ratio: number;
}

export function partyLiquidGold(party: Party): number {
  return party.sharedGold + party.members.reduce((s, m) => s + m.gold, 0);
}

export function partyWealthBand(config: RulesetConfig, party: Party): WealthBand {
  const liquidGold = partyLiquidGold(party);
  const expected = party.members.reduce((s, m) => s + (config.economy.expectedGoldPerLevel[m.level - 1] ?? 0), 0);
  const ratio = expected > 0 ? liquidGold / expected : 1;
  const bands = [...config.economy.wealthBands].sort((a, b) => a.maxRatio - b.maxRatio);
  const band = bands.find((b) => ratio <= b.maxRatio) ?? bands[bands.length - 1];
  return {
    label: band?.label ?? "normal",
    multiplier: band?.priceMultiplier ?? 1,
    liquidGold,
    expectedGold: expected,
    ratio,
  };
}

export interface ShopGenerationInput {
  seed: string;
  shopKind: string;
  settlementSize: SettlementSize;
  party: Party;
  reputation?: number;
  /** Override the settlement's default inventory size. */
  size?: number;
  /** Extra price-table entries (campaign-specific goods). */
  extraEntries?: PriceTableEntry[];
  /** Identifier factory (defaults to seeded ids). */
  id?: (prefix?: string) => string;
}

export interface ShopGenerationResult {
  items: ShopItem[];
  markup: number;
  wealth: WealthBand;
  totalValueGp: number;
  explanation: string[];
}

function rarityIndex(r: Rarity): number {
  return RARITY_ORDER.indexOf(r);
}
function settlementIndex(s: SettlementSize): number {
  return SETTLEMENT_ORDER.indexOf(s);
}

/**
 * Deterministic inventory from the price table, balanced against the party's
 * liquid gold: total shop value lands inside inventoryValueTarget × party gold,
 * with at least a few affordable items and a few aspirational ones.
 */
export function generateShopInventory(config: RulesetConfig, input: ShopGenerationInput): ShopGenerationResult {
  const rng = createRng(input.seed);
  let counter = 0;
  const id = input.id ?? ((prefix = "shopitem") => `${prefix}_${input.seed}_${++counter}`);
  const categories = config.economy.shopKinds[input.shopKind] ?? config.economy.shopKinds.general ?? [];
  const settlement = config.economy.settlementModifiers[input.settlementSize];
  const maxRarity = rarityIndex(settlement?.maxRarity ?? "common");
  const size = input.size ?? settlement?.inventorySize ?? 8;
  const wealth = partyWealthBand(config, input.party);
  const reputation = input.reputation ?? 0;
  const ctx: PriceContext = { settlementSize: input.settlementSize, reputation, wealthMultiplier: wealth.multiplier };
  const explanation: string[] = [
    `Shop kind "${input.shopKind}" carries: ${categories.join(", ") || "(nothing configured)"}`,
    `Settlement ${input.settlementSize}: price ×${settlement?.priceMultiplier ?? 1}, max rarity ${settlement?.maxRarity ?? "common"}, ${size} slots`,
    `Party wealth band "${wealth.label}" (${Math.round(wealth.liquidGold)} gp vs expected ${Math.round(wealth.expectedGold)} gp) → price ×${wealth.multiplier}`,
    `Reputation ${reputation} → price ×${reputationMultiplier(config, reputation).toFixed(2)}`,
  ];

  const pool = [...config.economy.priceTable, ...(input.extraEntries ?? [])].filter(
    (e) =>
      categories.includes(e.category) &&
      rarityIndex(e.rarity) <= maxRarity &&
      settlementIndex(e.minSettlement) <= settlementIndex(input.settlementSize) &&
      e.weight > 0,
  );
  if (pool.length === 0) {
    return { items: [], markup: 1, wealth, totalValueGp: 0, explanation: [...explanation, "No eligible items in the price table."] };
  }

  const liquid = Math.max(1, wealth.liquidGold);
  const target = config.economy.inventoryValueTarget;
  const targetMin = liquid * target.min;
  const targetMax = liquid * target.max;

  const chosen: ShopItem[] = [];
  const remaining = [...pool];
  let total = 0;
  let affordable = 0;
  const perPcGold = liquid / Math.max(1, input.party.members.length);
  while (chosen.length < size && remaining.length > 0) {
    // Prefer affordable items until we have a few, then allow aspirational ones.
    const needAffordable = affordable < Math.min(3, size);
    const weighted = remaining.map((e) => {
      const p = priceItem(config, e, ctx).priceGp;
      let w = e.weight;
      if (needAffordable && p > perPcGold) w *= 0.15;
      if (!needAffordable && total + p > targetMax) w *= 0.1;
      return { item: e, weight: w };
    });
    const entry = rng.weighted(weighted);
    remaining.splice(remaining.indexOf(entry), 1);
    const price = priceItem(config, entry, ctx);
    const stock = entry.category === "potion" || entry.category === "adventuring-gear" || entry.category === "food-lodging" ? rng.int(1, 5) : rng.int(1, 2);
    if (price.priceGp <= perPcGold) affordable += 1;
    total += price.priceGp * stock;
    chosen.push({
      id: id("shopitem"),
      name: entry.name,
      category: entry.category,
      basePriceGp: entry.basePriceGp,
      priceGp: price.priceGp,
      stock,
      rarity: entry.rarity,
      description: entry.description,
    });
    if (total >= targetMax && affordable >= 3 && chosen.length >= Math.ceil(size / 2)) break;
  }
  explanation.push(
    `Inventory value ${Math.round(total)} gp; target ${Math.round(targetMin)}–${Math.round(targetMax)} gp; ${affordable} item(s) affordable by a single PC (${Math.round(perPcGold)} gp each)`,
  );
  const markup = roundPrice(config, (settlement?.priceMultiplier ?? 1) * reputationMultiplier(config, reputation) * wealth.multiplier * 100) / 100;
  return { items: chosen, markup, wealth, totalValueGp: Math.round(total), explanation };
}

export interface InventoryValidationIssue {
  itemName: string;
  problem: string;
  correctedPriceGp?: number;
}

/**
 * AI-boundary validator: clamps prices to a sane band around the config price
 * and drops malformed rows so a bad generation degrades gracefully.
 */
export function validateShopInventory(
  config: RulesetConfig,
  items: ShopItem[],
  ctx: PriceContext,
  opts: { maxDeviation?: number } = {},
): { items: ShopItem[]; issues: InventoryValidationIssue[] } {
  const maxDev = opts.maxDeviation ?? 0.5;
  const issues: InventoryValidationIssue[] = [];
  const out: ShopItem[] = [];
  for (const it of items) {
    if (!it.name || !Number.isFinite(it.priceGp) || it.priceGp < 0 || !Number.isInteger(it.stock) || it.stock < 0) {
      issues.push({ itemName: it.name || "(unnamed)", problem: "malformed item dropped" });
      continue;
    }
    const known = config.economy.priceTable.find((e) => e.name.toLowerCase() === it.name.toLowerCase());
    const base = known ? known.basePriceGp : it.basePriceGp;
    if (Number.isFinite(base) && base > 0) {
      const expected = priceItem(config, { basePriceGp: base, category: it.category }, ctx).priceGp;
      const lo = expected * (1 - maxDev);
      const hi = expected * (1 + maxDev);
      if (it.priceGp < lo || it.priceGp > hi) {
        const corrected = roundPrice(config, Math.min(hi, Math.max(lo, it.priceGp)));
        issues.push({ itemName: it.name, problem: `price ${it.priceGp} gp outside ${lo.toFixed(2)}–${hi.toFixed(2)} gp band`, correctedPriceGp: corrected });
        out.push({ ...it, basePriceGp: base, priceGp: corrected });
        continue;
      }
      out.push({ ...it, basePriceGp: base });
    } else {
      out.push(it);
    }
  }
  return { items: out, issues };
}
