import { describe, expect, it } from "vitest";
import { classifyDifficulty, encounterXp, partyStrength, proposeDifficultyLevers, readCampaignEncounter, readEncounter, targetXpBand, xpBudget, type MonsterGroup } from "../index.js";
import { makeTestCampaign, makeTestRuleset } from "../testing.js";

const rules = makeTestRuleset();
const goblin = rules.monsters.find((m) => m.id === "mon_goblin")!;
const ogre = rules.monsters.find((m) => m.id === "mon_ogre")!;
const troll = rules.monsters.find((m) => m.id === "mon_troll")!;

describe("encounter math (2024)", () => {
  it("sums per-character budgets", () => {
    expect(xpBudget(rules, [3, 3, 3, 3])).toEqual({ low: 600, moderate: 900, high: 1600 });
  });
  it("sums monster XP without a multiplier by default", () => {
    const r = encounterXp(rules, [{ statBlock: goblin, count: 4 }]);
    expect(r).toEqual({ total: 200, adjusted: 200, count: 4 });
  });
  it("classifies difficulty against a budget", () => {
    const b = { low: 600, moderate: 900, high: 1600 };
    expect(classifyDifficulty(rules, 100, b)).toBe("trivial");
    expect(classifyDifficulty(rules, 300, b)).toBe("low");
    expect(classifyDifficulty(rules, 900, b)).toBe("moderate");
    expect(classifyDifficulty(rules, 1600, b)).toBe("high");
    expect(classifyDifficulty(rules, 2500, b)).toBe("deadly");
  });
  it("reads an encounter against a fully rested party", () => {
    const c = makeTestCampaign();
    const read = readCampaignEncounter(rules, c.party, c.world.encounters[1]!, c.world.statBlocks);
    expect(read.encounterXp).toBe(550);
    expect(read.difficultyAtFullRest).toBe("low");
    expect(read.strength.factor).toBe(1);
    expect(read.flags).toEqual([]);
    expect(read.explanation.join("\n")).toContain("budget L/M/H 600/900/1600");
  });
  it("a depleted party makes the same fight harder (current-state balancing)", () => {
    const c = makeTestCampaign();
    const depleted = {
      ...c.party,
      members: c.party.members.map((m) => ({
        ...m,
        currentHp: Math.ceil(m.maxHp * 0.3),
        spellSlots: m.spellSlots.map((s) => ({ ...s, used: s.max })),
        resources: m.resources.map((r) => ({ ...r, used: r.max })),
      })),
    };
    const strength = partyStrength(rules, depleted);
    expect(strength.factor).toBeLessThan(0.5);
    expect(strength.factor).toBeGreaterThanOrEqual(0.35);
    const groups: MonsterGroup[] = [{ statBlock: ogre, count: 2 }];
    const full = readEncounter(rules, c.party, groups);
    const now = readEncounter(rules, depleted, groups);
    expect(full.difficultyAtFullRest).toBe("moderate");
    expect(now.difficultyNow).toBe("deadly");
    expect(now.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["DEADLY_NOW", "PARTY_DEPLETED"]));
  });
  it("flags missing stat blocks and empty encounters", () => {
    const c = makeTestCampaign();
    const read = readCampaignEncounter(rules, c.party, { ...c.world.encounters[0]!, monsters: [{ statBlockId: "mon_nope", count: 1 }] }, []);
    expect(read.flags.map((f) => f.code)).toEqual(expect.arrayContaining(["UNKNOWN_STATBLOCK", "NO_MONSTERS"]));
  });
  it("gives a target band per difficulty", () => {
    const c = makeTestCampaign();
    expect(targetXpBand(rules, c.party, "moderate")).toMatchObject({ min: 900, max: 1599 });
    expect(targetXpBand(rules, c.party, "high").max).toBe(2400);
  });
});

describe("difficulty levers (Principle 2)", () => {
  it("proposes easier options with costs when the fight is deadly", () => {
    const c = makeTestCampaign();
    const groups: MonsterGroup[] = [{ statBlock: troll, count: 2 }, { statBlock: goblin, count: 3 }];
    const read = readEncounter(rules, c.party, groups);
    expect(read.difficultyNow).toBe("deadly");
    const levers = proposeDifficultyLevers(rules, { read, groups, pcsInDanger: 0.5, round: 3 });
    expect(levers.length).toBeGreaterThan(0);
    expect(levers.every((l) => l.direction === "easier")).toBe(true);
    for (const l of levers) {
      expect(l.cost.length).toBeGreaterThan(10);
      expect(l.narrative.length).toBeGreaterThan(10);
      expect(l.xpDelta).toBeLessThan(0);
    }
    expect(levers.find((l) => l.id === "retreat")?.title).toContain("Goblin");
  });
  it("proposes harder options when the fight is trivial", () => {
    const c = makeTestCampaign();
    const groups: MonsterGroup[] = [{ statBlock: goblin, count: 1 }];
    const read = readEncounter(rules, c.party, groups);
    const levers = proposeDifficultyLevers(rules, { read, groups, pcsInDanger: 0, round: 1 });
    expect(levers.every((l) => l.direction === "harder")).toBe(true);
    expect(levers.map((l) => l.id)).toContain("reinforcements");
  });
  it("proposes nothing when the fight is on target", () => {
    const c = makeTestCampaign();
    const groups: MonsterGroup[] = [{ statBlock: ogre, count: 2 }];
    const read = readEncounter(rules, c.party, groups);
    expect(proposeDifficultyLevers(rules, { read, groups, pcsInDanger: 0, round: 2 })).toEqual([]);
  });
});
