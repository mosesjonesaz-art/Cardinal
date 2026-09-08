import { describe, expect, it } from "vitest";
import {
  backstageTerms, buildDmRecap, buildFactionMap, buildLootLog, buildPlayerRecap, buildSessionBriefData, buildTimeline, checkCanon, checkEventAgainstCanon,
  dueConsequences, factKnowledge, findLeaks, locationPath, pcOnlyKnowledge, pendingLevelUps, playerSafeView, reduceCampaign, renderBriefText,
  scanSafety, spotlightForecast, spotlightFromEvents, suggestConsequenceTags,
} from "../index.js";
import { makeTestCampaign, makeTestContext, makeTestRuleset } from "../testing.js";

const rules = makeTestRuleset();

describe("fog of knowledge", () => {
  it("classifies facts as party / pc / backstage", () => {
    const c = makeTestCampaign();
    expect(factKnowledge(c, "fact_public")?.scope).toBe("party");
    expect(factKnowledge(c, "fact_secret_grimoire")).toMatchObject({ scope: "pc", pcIds: ["pc_bram"] });
    expect(factKnowledge(c, "fact_backstage")?.scope).toBe("backstage");
    expect(pcOnlyKnowledge(c, "pc_bram").map((f) => f.id)).toEqual(["fact_secret_grimoire"]);
  });
  it("player-safe view strips secrets, unmet NPCs, undiscovered locations", () => {
    const c = makeTestCampaign();
    const v = playerSafeView(c);
    expect(v.npcs.map((n) => n.id)).toEqual(["npc_mara"]);
    expect(v.locations.map((l) => l.id)).not.toContain("loc_ruins");
    expect(JSON.stringify(v)).not.toContain("Ashen Hand");
    expect(JSON.stringify(v)).not.toContain("Cinder Priest");
    expect(v.events).toHaveLength(3);
    expect(v.facts.map((f) => f.id)).toEqual(["fact_public"]);
  });
  it("detects backstage leaks in generated text", () => {
    const c = makeTestCampaign();
    expect(backstageTerms(c)).toContain("the cinder priest");
    expect(findLeaks("You learn the mayor owes the Ashen Hand 500 gp.", c)).toEqual(expect.arrayContaining(["ashen hand", "the mayor owes the ashen hand 500 gp."]));
    expect(findLeaks("Mara pours you an ale.", c)).toEqual([]);
  });
});

describe("canon checks", () => {
  it("passes a consistent campaign (apart from info-level notes)", () => {
    const issues = checkCanon(makeTestCampaign(), rules.monsters.map((m) => m.id));
    expect(issues.filter((i) => i.severity === "error")).toEqual([]);
  });
  it("flags a dead NPC acting after their death, missing refs and cycles", () => {
    const ctx = makeTestContext();
    let c = makeTestCampaign();
    c = reduceCampaign(c, { type: "logEvent", sessionId: "ses_1", event: { kind: "combat", text: "Old Wick died.", npcIds: ["npc_ghost"], tags: ["death"], at: "2026-01-01T02:00:00.000Z" } }, ctx);
    c = reduceCampaign(c, { type: "logEvent", sessionId: "ses_1", event: { kind: "npc-interaction", text: "Old Wick offers tea.", npcIds: ["npc_ghost"], at: "2026-01-01T03:00:00.000Z" } }, ctx);
    c = reduceCampaign(c, { type: "upsertLocation", location: { id: "loc_valley", name: "Greywater Valley", kind: "region", parentId: "loc_town", description: "", secretNotes: "", hooks: [], tags: [], discoveredByParty: true, provisional: false } }, ctx);
    c = reduceCampaign(c, { type: "upsertNpc", npc: { ...c.world.npcs[1]!, id: "npc_dup", name: "mara tell", locationId: "loc_missing" } }, ctx);
    const codes = checkCanon(c, ["mon_goblin", "mon_ogre"]).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["DEAD_NPC_ACTIVE", "LOCATION_CYCLE", "DUPLICATE_NAME", "NPC_LOCATION_MISSING"]));
  });
  it("checks a single proposed event and safety lines", () => {
    const c = makeTestCampaign();
    expect(checkEventAgainstCanon(c, { kind: "npc-interaction", npcIds: ["npc_ghost"], tags: [], text: "Wick waves." }).map((i) => i.code)).toEqual(["DEAD_NPC_ACTIVE"]);
    expect(checkEventAgainstCanon(c, { kind: "npc-interaction", npcIds: ["npc_ghost"], tags: ["posthumous"], text: "Wick's ghost waves." })).toEqual([]);
    expect(scanSafety("A scene of harm to children", c.safety).lines).toEqual(["harm to children"]);
    expect(scanSafety("Rumours of torture", c.safety).veils).toEqual(["torture"]);
  });
  it("computes location paths", () => {
    expect(locationPath(makeTestCampaign(), "loc_inn").map((l) => l.name)).toEqual(["Greywater Valley", "Millbrook", "The Drowned Rat"]);
  });
});

describe("spotlight", () => {
  it("forecasts who is owed focus", () => {
    const c = makeTestCampaign();
    const f = spotlightForecast(c.party, c.sessions);
    expect(f[0]?.name).toBe("Dov");
    expect(f.at(-1)?.name).toBe("Ava");
    expect(f[0]!.deficit).toBeGreaterThan(0);
  });
  it("derives weights from event tags", () => {
    const c = makeTestCampaign();
    const w = spotlightFromEvents(c.sessions[0]!, c.party.members);
    expect(w["pc_ava"]).toBeGreaterThan(w["pc_dov"]!);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });
});

describe("consequences", () => {
  it("surfaces due consequences by session number", () => {
    const c = makeTestCampaign();
    expect(dueConsequences(c, 1)).toEqual([]);
    expect(dueConsequences(c).map((q) => q.id)).toEqual(["csq_1"]);
  });
  it("suggests tags from text", () => {
    expect(suggestConsequenceTags("They killed the guard and stole his purse", "choice")).toEqual(expect.arrayContaining(["choice", "death", "theft"]));
  });
});

describe("recaps, brief, bonus", () => {
  it("player recap excludes secret events; DM recap includes them", () => {
    const c = makeTestCampaign();
    const player = buildPlayerRecap(c, "ses_1");
    expect(player).toContain("Mara Tell offered rooms");
    expect(player).not.toContain("Cinder Priest");
    expect(buildDmRecap(c, "ses_1")).toContain("SECRET");
  });
  it("builds a brief with debriefs, forecast, flags and consequences", () => {
    const c = makeTestCampaign();
    const d = buildSessionBriefData(c, rules);
    expect(d.nextSessionNumber).toBe(2);
    expect(d.currentLocationPath).toBe("Greywater Valley › Millbrook");
    expect(d.pcDebriefs.find((p) => p.name === "Bram")?.privateSecretsCount).toBe(1);
    expect(d.dueConsequences).toHaveLength(1);
    expect(d.plannedEncounters).toHaveLength(2);
    expect(d.likelyNpcs.map((n) => n.id)).not.toContain("npc_ghost");
    const text = renderBriefText(d);
    expect(text).toContain("Per-PC debrief");
    expect(text).toContain("Consequences to resurface");
  });
  it("timeline, faction map, loot log, pending level ups", () => {
    const c = makeTestCampaign();
    expect(buildTimeline(c)).toHaveLength(3);
    expect(buildTimeline(c, { includeSecret: true })).toHaveLength(4);
    expect(buildFactionMap(c).edges).toEqual([{ from: "fac_militia", to: "fac_hand", stance: "hostile", note: "" }]);
    expect(buildLootLog(c)).toEqual([]);
    const same = { ...c, party: { ...c.party, members: c.party.members.map((m) => ({ ...m, xp: 950 })) } };
    expect(pendingLevelUps(rules, same.party.members)).toEqual([]);
    const more = { ...c, party: { ...c.party, members: c.party.members.map((m) => ({ ...m, xp: 2700 })) } };
    expect(pendingLevelUps(rules, more.party.members).map((l) => l.to)).toEqual([4, 4, 4, 4]);
  });
});
