import { describe, expect, it } from "vitest";
import { makeTestCampaign, makeTestRuleset } from "@cardinal/core/testing";
import { readEncounter, startCombat, type MonsterGroup } from "@cardinal/core";
import {
  GenerationService, MockProvider, briefGenerator, encounterGenerator, enrichLevers, finalizeShop, leversGenerator,
  locationSceneGenerator, npcCardGenerator, offScriptGenerator, offScriptToRecords, playerRecapGenerator, readProposal, shopGenerator, tacticsGenerator,
} from "../index.js";

const campaign = makeTestCampaign();
const rules = makeTestRuleset();

describe("prompts respect the principles", () => {
  it("system prompt states DM-only, no-fudging, overrides-as-truth; user prompt carries safety tools", () => {
    const p = locationSceneGenerator.buildPrompt({ campaign, locationId: "loc_inn" });
    expect(p.system).toMatch(/DM-only/);
    expect(p.system).toMatch(/Never fudge/);
    expect(p.system).toMatch(/ground truth/);
    expect(p.user).toContain("harm to children");
    expect(p.user).toContain("torture");
    expect(p.user).toContain("npc_mara");
    expect(p.user).toContain("Launders coin"); // DM-only secret is available to the model, marked as such
  });
  it("player recap prompt never contains backstage content", () => {
    const p = playerRecapGenerator.buildPrompt({ campaign, sessionId: "ses_1" });
    expect(p.user).not.toContain("Cinder Priest");
    expect(p.user).not.toContain("Ashen Hand");
    expect(p.user).not.toContain("Launders");
    expect(p.user).toContain("Mara Tell offered rooms");
  });
});

describe("location scene", () => {
  it("drops NPCs that are not at the location and replaces read-aloud text that hits a safety line", async () => {
    const provider = new MockProvider().on("locationScene", () => ({
      readAloud: "A scene involving harm to children.",
      ambient: [],
      presentNpcs: [{ npcId: "npc_mara", hook: "ok" }, { npcId: "npc_orrin", hook: "not here" }, { npcId: "npc_ghost", hook: "dead" }],
      hooks: [],
      dmNotes: [],
    }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(locationSceneGenerator, { campaign, locationId: "loc_inn" });
    expect(r.source).toBe("llm");
    expect(r.output.presentNpcs.map((p) => p.npcId)).toEqual(["npc_mara"]);
    expect(r.output.readAloud).toBe("A damp riverside inn.");
    expect(r.issues.join(" ")).toMatch(/Safety line/);
    expect(r.issues.length).toBe(3);
  });
  it("fallback builds a usable card from canon", () => {
    const f = locationSceneGenerator.fallback({ campaign, locationId: "loc_inn" });
    expect(f.readAloud).toBe("A damp riverside inn.");
    expect(f.presentNpcs[0]?.npcId).toBe("npc_mara");
    expect(locationSceneGenerator.schema.safeParse(f).success).toBe(true);
  });
});

describe("off-script", () => {
  it("rejects NPC names that already exist and produces provisional records", async () => {
    const provider = new MockProvider().on("offScript", () => ({
      location: { name: "Old Mill", kind: "building", description: "Creaking.", hooks: [], secretNotes: "" },
      npcs: [
        { name: "Mara Tell", role: "x", appearance: "", personality: "", mannerisms: [], voice: { pitch: "medium", pace: "measured", texture: "", accent: "", catchphrases: [], notes: "" }, motive: "", secretMotive: "", mood: "calm" },
        { name: "Piet", role: "miller", appearance: "", personality: "", mannerisms: [], voice: { pitch: "medium", pace: "measured", texture: "", accent: "", catchphrases: [], notes: "" }, motive: "", secretMotive: "", mood: "calm" },
      ],
      readAloud: "The mill.",
      canonNotes: [],
    }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(offScriptGenerator, { campaign, dmPrompt: "the old mill", parentLocationId: "loc_town" });
    expect(r.output.npcs.map((n) => n.name)).toEqual(["Piet"]);
    expect(r.issues[0]).toContain("Mara Tell");
    let n = 0;
    const recs = offScriptToRecords(r.output, "loc_town", (p) => `${p}_${++n}`);
    expect(recs.location).toMatchObject({ id: "loc_1", parentId: "loc_town", provisional: true, discoveredByParty: true });
    expect(recs.npcs[0]).toMatchObject({ id: "npc_2", locationId: "loc_1", provisional: true });
  });
  it("fallback is schema-valid and clearly marked", () => {
    const f = offScriptGenerator.fallback({ campaign, dmPrompt: "a cave", parentLocationId: "loc_valley" });
    expect(offScriptGenerator.schema.safeParse(f).success).toBe(true);
    expect(f.canonNotes[0]).toMatch(/Fallback/);
  });
});

describe("npc card", () => {
  it("fallback is built from the NPC record with a mood voice directive", () => {
    const f = npcCardGenerator.fallback({ campaign, npcId: "npc_mara" });
    expect(f.openingLine).toBe("Mind the step.");
    expect(f.voiceCue).toContain("warm");
    expect(f.secretAgenda).toContain("Launders");
    expect(npcCardGenerator.schema.safeParse(f).success).toBe(true);
  });
});

describe("shop", () => {
  const input = { campaign, rules, shopKind: "smith" as const, settlementSize: "town" as const, seed: "shop1" };
  it("clamps AI prices to ±25% of the rules-engine price and keeps matched items", async () => {
    const base = shopGenerator.fallback(input);
    const first = base.items[0]!;
    const provider = new MockProvider().on("shopInventory", () => ({
      shopName: "Hammer & Tongs",
      description: "Hot.",
      keeperLine: "Mind the sparks.",
      items: [{ ...first, priceGp: first.priceGp * 10, description: "Overpriced" }, { name: "Mystery Blade", category: "weapon", priceGp: 12, stock: 1, description: "" }],
    }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(shopGenerator, input);
    const shop = finalizeShop(r.output, input);
    expect(shop.shopName).toBe("Hammer & Tongs");
    expect(shop.items[0]?.priceGp).toBeCloseTo(first.priceGp * 1.25, 2);
    expect(shop.items[1]?.name).toBe("Mystery Blade");
    expect(shop.explanation.some((l) => l.includes("Boundary check"))).toBe(true);
  });
  it("falls back to the baseline when the AI returns nothing usable", async () => {
    const provider = new MockProvider().on("shopInventory", () => ({ shopName: "Empty", description: "", keeperLine: "", items: [] }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(shopGenerator, input);
    const shop = finalizeShop(r.output, input);
    expect(shop.items.length).toBeGreaterThan(0);
    expect(r.issues[0]).toContain("no items");
  });
});

describe("encounter proposal", () => {
  const input = { campaign, rules, difficulty: "moderate" as const };
  it("drops unknown stat blocks and flags XP outside the band", async () => {
    const provider = new MockProvider().on("encounterProposal", () => ({ name: "Test", narrative: "", monsters: [{ statBlockId: "mon_troll", count: 3 }, { statBlockId: "mon_dragon", count: 1 }], tactics: "", twist: "" }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(encounterGenerator, input);
    expect(r.output.monsters).toEqual([{ statBlockId: "mon_troll", count: 3 }]);
    expect(r.issues.join(" ")).toMatch(/Dropped unknown/);
    expect(r.issues.join(" ")).toMatch(/outside the moderate band/);
    expect(readProposal(input, r.output).read.difficultyNow).toBe("deadly");
  });
  it("fallback lands in or near the band and is schema-valid", () => {
    const f = encounterGenerator.fallback({ ...input, seed: "e1" });
    expect(encounterGenerator.schema.safeParse(f).success).toBe(true);
    const { read } = readProposal(input, f);
    expect(read.monsterCount).toBeGreaterThan(0);
  });
});

describe("difficulty levers", () => {
  it("keeps only rules-engine lever ids, fills missing ones, and re-attaches xp math", async () => {
    const troll = rules.monsters.find((m) => m.id === "mon_troll")!;
    const groups: MonsterGroup[] = [{ statBlock: troll, count: 2 }];
    const read = readEncounter(rules, campaign.party, groups);
    const input = { campaign, rules, read, groups, round: 2, pcsInDanger: 0.5 };
    const provider = new MockProvider().on("difficultyLevers", () => ({ levers: [{ id: "retreat", title: "They flee", narrative: "custom", cost: "custom cost", mechanicalEffect: "remove" }, { id: "free-win", title: "x", narrative: "y", cost: "z", mechanicalEffect: "w" }] }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(leversGenerator, input);
    expect(r.issues[0]).toContain("free-win");
    const enriched = enrichLevers(r.output, input);
    expect(enriched.find((l) => l.id === "retreat")).toMatchObject({ narrative: "custom", direction: "easier" });
    expect(enriched.every((l) => typeof l.xpDelta === "number")).toBe(true);
    expect(enriched.length).toBeGreaterThan(1);
  });
});

describe("player recap boundary", () => {
  it("strips sentences that leak backstage terms", async () => {
    const provider = new MockProvider().on("playerRecap", () => ({ recap: "You arrived in Millbrook. The Cinder Priest watched you from the rafters. Mara gave you rooms.", teaser: "The Ashen Hand stirs." }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(playerRecapGenerator, { campaign, sessionId: "ses_1" });
    expect(r.output.recap).toBe("You arrived in Millbrook. Mara gave you rooms.");
    expect(r.output.teaser).toBe("");
    expect(r.issues[0]).toMatch(/leak/);
  });
  it("uses the deterministic recap when everything leaks", async () => {
    const provider = new MockProvider().on("playerRecap", () => ({ recap: "The Cinder Priest is here.", teaser: "" }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(playerRecapGenerator, { campaign, sessionId: "ses_1" });
    expect(r.output.recap).toContain("Session 1");
    expect(r.output.recap).not.toContain("Cinder");
  });
});

describe("brief & tactics fallbacks", () => {
  it("brief fallback carries debriefs and consequences", () => {
    const f = briefGenerator.fallback({ campaign, rules });
    expect(f.pcDebriefs).toHaveLength(4);
    expect(f.consequencesToSurface).toHaveLength(1);
    expect(briefGenerator.schema.safeParse(f).success).toBe(true);
  });
  it("tactics drops suggestions for unknown combatants", async () => {
    const enc = campaign.world.encounters[0]!;
    const combat = startCombat({ id: "c", encounter: enc, party: campaign.party, statBlocks: rules.monsters, pcInitiatives: {} });
    const read = readEncounter(rules, campaign.party, [{ statBlock: rules.monsters[0]!, count: 4 }]);
    const provider = new MockProvider().on("tacticalAdvice", () => ({ suggestions: [{ combatantId: "c_mon_goblin_1", text: "Shoot." }, { combatantId: "nope", text: "?" }] }));
    const svc = new GenerationService({ provider });
    const r = await svc.run(tacticsGenerator, { campaign, combat, statBlocks: rules.monsters, read });
    expect(r.output.suggestions).toHaveLength(1);
    expect(r.issues).toHaveLength(1);
  });
});
