import { z } from "zod";
import {
  ItemCategorySchema, generateShopInventory, partyWealthBand, validateShopInventory,
  type Campaign, type RulesetConfig, type SettlementSize, type ShopItem,
} from "@cardinal/core";
import { defineGenerator } from "../generator.js";
import { PRINCIPLES, campaignFrame } from "../prompts.js";

export const ShopFlavorSchema = z.object({
  shopName: z.string().min(1),
  /** One or two sentences for the DM to describe the shop. */
  description: z.string(),
  keeperLine: z.string(),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        category: ItemCategorySchema,
        priceGp: z.number().min(0),
        stock: z.number().int().min(0),
        description: z.string(),
      }),
    )
    .max(24),
});
export type ShopFlavor = z.infer<typeof ShopFlavorSchema>;

export interface ShopInput {
  campaign: Campaign;
  rules: RulesetConfig;
  shopKind: string;
  settlementSize: SettlementSize;
  seed: string;
  reputation?: number;
  ownerNpcId?: string;
  size?: number;
}

/** The final, validated shop the DM sees: core-priced items plus AI flavour. */
export interface ShopResult {
  shopName: string;
  description: string;
  keeperLine: string;
  items: ShopItem[];
  explanation: string[];
}

function baseline(input: ShopInput) {
  return generateShopInventory(input.rules, {
    seed: input.seed,
    shopKind: input.shopKind,
    settlementSize: input.settlementSize,
    party: input.campaign.party,
    reputation: input.reputation,
    size: input.size,
  });
}

export const shopGenerator = defineGenerator<ShopInput, ShopFlavor>({
  name: "shopInventory",
  schema: ShopFlavorSchema,
  summarizeInput: (i) => ({ shopKind: i.shopKind, settlementSize: i.settlementSize, seed: i.seed, reputation: i.reputation }),
  buildPrompt(input) {
    const base = baseline(input);
    const owner = input.ownerNpcId ? input.campaign.world.npcs.find((n) => n.id === input.ownerNpcId) : undefined;
    const user = [
      campaignFrame(input.campaign),
      "",
      `Shop kind: ${input.shopKind} in a ${input.settlementSize}.`,
      owner ? `Shopkeeper: ${owner.name}, ${owner.role}, mood ${owner.mood}, relationship to party ${owner.relationshipToParty}.` : "Shopkeeper: unnamed; invent a one-line keeper.",
      `Party wealth band: ${base.wealth.label} (${Math.round(base.wealth.liquidGold)} gp liquid).`,
      "",
      "Balanced baseline inventory (prices already computed by the rules engine; keep prices within ±25% of these, keep the same names so they can be matched):",
      ...base.items.map((i) => `- ${i.name} [${i.category}] ${i.priceGp} gp × ${i.stock}${i.description ? ` — ${i.description}` : ""}`),
      "",
      "Return the same items with short flavourful descriptions, a shop name, a description, and one line the keeper says. You may add at most one extra thematic item priced sensibly.",
    ].join("\n");
    return { system: PRINCIPLES, user, maxTokens: 2000, effort: "low" };
  },
  postValidate(output, input) {
    const issues: string[] = [];
    if (output.items.length === 0) issues.push("Model returned no items; baseline used");
    return { output, issues };
  },
  fallback(input) {
    const base = baseline(input);
    return {
      shopName: `${input.shopKind[0]?.toUpperCase() ?? ""}${input.shopKind.slice(1)}`,
      description: "(AI unavailable) A serviceable shop; describe from the inventory.",
      keeperLine: "What'll it be?",
      items: base.items.map((i) => ({ name: i.name, category: i.category, priceGp: i.priceGp, stock: i.stock, description: i.description })),
    };
  },
});

/** Merges AI flavour with the core baseline and clamps every price at the boundary. */
export function finalizeShop(flavor: ShopFlavor, input: ShopInput): ShopResult {
  const base = baseline(input);
  const wealth = partyWealthBand(input.rules, input.campaign.party);
  const ctx = { settlementSize: input.settlementSize, reputation: input.reputation ?? 0, wealthMultiplier: wealth.multiplier };
  let counter = 0;
  const candidate: ShopItem[] = (flavor.items.length ? flavor.items : base.items).map((it) => {
    const match = base.items.find((b) => b.name.toLowerCase() === it.name.toLowerCase());
    return {
      id: match?.id ?? `shopitem_${input.seed}_x${++counter}`,
      name: it.name,
      category: it.category,
      basePriceGp: match?.basePriceGp ?? ("basePriceGp" in it ? (it as ShopItem).basePriceGp : it.priceGp),
      priceGp: it.priceGp,
      stock: it.stock,
      rarity: match?.rarity ?? "common",
      description: it.description || match?.description || "",
    };
  });
  const { items, issues } = validateShopInventory(input.rules, candidate, ctx, { maxDeviation: 0.25 });
  const explanation = [...base.explanation, ...issues.map((i) => `Boundary check: ${i.itemName} — ${i.problem}${i.correctedPriceGp !== undefined ? ` (corrected to ${i.correctedPriceGp} gp)` : ""}`)];
  return {
    shopName: flavor.shopName,
    description: flavor.description,
    keeperLine: flavor.keeperLine,
    items: items.length ? items : base.items,
    explanation: items.length ? explanation : [...explanation, "All AI items were invalid; baseline inventory used."],
  };
}
