import { describe, expect, it } from "vitest";
import { getAtPath, InvalidActionError, pcPath, reduceAll, reduceCampaign, setAtPath } from "../index.js";
import { makeTestCampaign, makeTestContext } from "../testing.js";

describe("paths", () => {
  it("gets and sets immutably", () => {
    const c = makeTestCampaign();
    expect(getAtPath(c, "party.members.0.name")).toBe("Ava");
    const next = setAtPath(c, "party.members[1].gold", 99);
    expect(next.party.members[1]?.gold).toBe(99);
    expect(c.party.members[1]?.gold).toBe(35);
    expect(next.party.members[0]).toBe(c.party.members[0]);
  });
  it("rejects unknown paths", () => {
    expect(() => setAtPath(makeTestCampaign(), "party.nope.x", 1)).toThrow();
  });
});

describe("reducer: overrides are ground truth (Principle 3)", () => {
  it("records a generic override and validates the result", () => {
    const ctx = makeTestContext();
    const c = makeTestCampaign();
    const next = reduceCampaign(c, { type: "override", path: pcPath(c, "pc_ava", "currentHp"), value: 5, reason: "fell off roof" }, ctx);
    expect(next.party.members[0]?.currentHp).toBe(5);
    expect(next.overrides).toHaveLength(1);
    expect(next.overrides[0]).toMatchObject({ path: "party.members.0.currentHp", previous: 28, next: 5, reason: "fell off roof" });
    expect(next.updatedAt).not.toBe(c.updatedAt);
  });
  it("rejects overrides that break the schema", () => {
    const c = makeTestCampaign();
    expect(() => reduceCampaign(c, { type: "override", path: "party.members.0.level", value: 99 })).toThrow(InvalidActionError);
    expect(() => reduceCampaign(c, { type: "override", path: "party.members.9.level", value: 2 })).toThrow(InvalidActionError);
  });
  it("adjustPcHp uses temp HP first and clamps to 0..max", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "setPcTempHp", pcId: "pc_ava", value: 5 }, ctx);
    c = reduceCampaign(c, { type: "adjustPcHp", pcId: "pc_ava", delta: -8 }, ctx);
    expect(c.party.members[0]).toMatchObject({ tempHp: 0, currentHp: 25 });
    c = reduceCampaign(c, { type: "adjustPcHp", pcId: "pc_ava", delta: -100 }, ctx);
    expect(c.party.members[0]?.currentHp).toBe(0);
    c = reduceCampaign(c, { type: "adjustPcHp", pcId: "pc_ava", delta: 500 }, ctx);
    expect(c.party.members[0]?.currentHp).toBe(28);
    expect(c.overrides.map((o) => o.path)).toEqual(["party.members.0.currentHp", "party.members.0.currentHp", "party.members.0.currentHp"]);
  });
  it("gold never goes negative and shared gold is tracked", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "adjustGold", target: { pcId: "pc_dov" }, delta: -50 }, ctx);
    expect(c.party.members[3]?.gold).toBe(0);
    c = reduceCampaign(c, { type: "adjustGold", target: { shared: true }, delta: 10 }, ctx);
    expect(c.party.sharedGold).toBe(50);
  });
  it("flags and reputation record overrides", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceAll(c, [{ type: "setFlag", key: "quest.tower.done", value: true }, { type: "adjustReputation", factionId: "fac_militia", delta: -30 }], ctx);
    expect(c.world.flags["quest.tower.done"]).toBe(true);
    expect(c.world.factions[1]?.reputation).toBe(-15);
    expect(c.overrides).toHaveLength(2);
  });
});

describe("reducer: resources & rests", () => {
  it("spends slots/resources and restores them on rest", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceAll(c, [
      { type: "useSpellSlot", pcId: "pc_bram", level: 1 },
      { type: "useSpellSlot", pcId: "pc_bram", level: 1 },
      { type: "useResource", pcId: "pc_ava", name: "Second Wind" },
      { type: "adjustPcHp", pcId: "pc_ava", delta: -10 },
    ], ctx);
    expect(c.party.members[1]?.spellSlots[0]?.used).toBe(2);
    expect(c.party.members[0]?.resources[0]?.used).toBe(1);
    c = reduceCampaign(c, { type: "rest", kind: "short" }, ctx);
    expect(c.party.members[0]?.resources[0]?.used).toBe(0);
    expect(c.party.members[1]?.spellSlots[0]?.used).toBe(2);
    expect(c.party.members[0]?.currentHp).toBe(18);
    c = reduceCampaign(c, { type: "rest", kind: "long" }, ctx);
    expect(c.party.members[1]?.spellSlots[0]?.used).toBe(0);
    expect(c.party.members[0]?.currentHp).toBe(28);
  });
  it("gives and removes items", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "giveItem", target: { pcId: "pc_dov" }, item: { name: "Potion of Healing", category: "potion", quantity: 2, valueGp: 50, notes: "" } }, ctx);
    const item = c.party.members[3]?.inventory[0];
    expect(item?.quantity).toBe(2);
    c = reduceCampaign(c, { type: "removeItem", target: { pcId: "pc_dov" }, itemId: item!.id, quantity: 1 }, ctx);
    expect(c.party.members[3]?.inventory[0]?.quantity).toBe(1);
    c = reduceCampaign(c, { type: "removeItem", target: { pcId: "pc_dov" }, itemId: item!.id }, ctx);
    expect(c.party.members[3]?.inventory).toHaveLength(0);
  });
});

describe("reducer: world, sessions, knowledge, consequences", () => {
  it("creates sessions with incrementing numbers and logs events", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "createSession", title: "Into the tower" }, ctx);
    const s = c.sessions[1]!;
    expect(s.number).toBe(2);
    c = reduceCampaign(c, { type: "logEvent", sessionId: s.id, event: { kind: "travel", text: "Walked to the ruins.", locationId: "loc_ruins" } }, ctx);
    expect(c.sessions[1]?.events[0]).toMatchObject({ kind: "travel", secret: false, pcIds: [] });
  });
  it("reveals facts to the party or a single PC", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "revealFact", factId: "fact_backstage", pcId: "pc_dov" }, ctx);
    expect(c.party.members[3]?.privateKnowledge).toEqual(["fact_backstage"]);
    c = reduceCampaign(c, { type: "revealFact", factId: "fact_backstage" }, ctx);
    expect(c.knowledge.partyKnown).toEqual(["fact_backstage"]);
    expect(() => reduceCampaign(c, { type: "revealFact", factId: "nope" }, ctx)).toThrow(InvalidActionError);
  });
  it("moves the party and marks the location discovered", () => {
    const c = reduceCampaign(makeTestCampaign(), { type: "setPartyLocation", locationId: "loc_ruins" });
    expect(c.party.currentLocationId).toBe("loc_ruins");
    expect(c.world.locations.find((l) => l.id === "loc_ruins")?.discoveredByParty).toBe(true);
  });
  it("NPC status change records an override; memories accumulate", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "setNpcStatus", npcId: "npc_orrin", status: "missing", reason: "kidnapped" }, ctx);
    expect(c.overrides[0]).toMatchObject({ path: "world.npcs.1.status", previous: "alive", next: "missing" });
    c = reduceCampaign(c, { type: "npcRemember", npcId: "npc_mara", memory: { summary: "They asked about the cellar.", sentiment: -0.2 } }, ctx);
    expect(c.world.npcs[0]?.memories).toHaveLength(2);
  });
  it("adds and surfaces consequences", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "addConsequence", consequence: { description: "The goblins remember the fire.", affectedNpcIds: [] } }, ctx);
    const q = c.consequences[1]!;
    expect(q.status).toBe("pending");
    c = reduceCampaign(c, { type: "setConsequenceStatus", consequenceId: q.id, status: "surfaced", sessionId: "ses_1" }, ctx);
    expect(c.consequences[1]).toMatchObject({ status: "surfaced", surfacedInSessionId: "ses_1" });
  });
  it("approves provisional content", () => {
    let c = reduceCampaign(makeTestCampaign(), { type: "upsertLocation", location: { id: "loc_new", name: "Secret Cove", kind: "landmark", provisional: true, description: "", secretNotes: "", hooks: [], tags: [], discoveredByParty: true } });
    expect(c.world.locations.at(-1)?.provisional).toBe(true);
    c = reduceCampaign(c, { type: "approveProvisional", kind: "location", id: "loc_new" });
    expect(c.world.locations.at(-1)?.provisional).toBe(false);
  });
});
