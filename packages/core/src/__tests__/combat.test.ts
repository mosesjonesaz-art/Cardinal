import { describe, expect, it } from "vitest";
import { addMonsterFromStatBlock, applyDamage, currentCombatant, nextTurn, pcsInDangerFraction, readLiveCombat, removeCombatant, startCombat, suggestTactics, summarizeCombat, toggleCondition } from "../index.js";
import { makeTestCampaign, makeTestRuleset } from "../testing.js";

const rules = makeTestRuleset();

function setup() {
  const c = makeTestCampaign();
  const enc = c.world.encounters[0]!; // 4 goblins
  const state = startCombat({ id: "cbt", encounter: enc, party: c.party, statBlocks: rules.monsters, pcInitiatives: { pc_ava: 18, pc_bram: 5, pc_cass: 12, pc_dov: 20 }, monsterInitiatives: { mon_goblin: 14 } });
  return { c, enc, state };
}

describe("combat tracker", () => {
  it("builds initiative order with numbered monsters", () => {
    const { state } = setup();
    expect(state.combatants.map((x) => x.name)).toEqual(["Dov", "Ava", "Goblin 1", "Goblin 2", "Goblin 3", "Goblin 4", "Cass", "Bram"]);
    expect(currentCombatant(state)?.name).toBe("Dov");
  });
  it("advances turns, skips dead monsters and increments rounds", () => {
    let { state } = setup();
    state = applyDamage(state, "c_mon_goblin_1", 10);
    state = nextTurn(state); // Ava
    state = nextTurn(state); // skips Goblin 1 → Goblin 2
    expect(currentCombatant(state)?.name).toBe("Goblin 2");
    for (let i = 0; i < 6; i++) state = nextTurn(state);
    expect(state.round).toBe(2);
    expect(state.log.at(-1)?.text).toBe("Round 2.");
  });
  it("adds reinforcements, removes combatants, toggles conditions", () => {
    let { state } = setup();
    state = addMonsterFromStatBlock(state, rules.monsters.find((m) => m.id === "mon_bugbear")!, 16);
    expect(state.combatants.map((x) => x.name)).toContain("Bugbear 1");
    expect(currentCombatant(state)?.name).toBe("Dov");
    state = removeCombatant(state, "c_mon_goblin_4");
    expect(state.combatants.some((x) => x.id === "c_mon_goblin_4")).toBe(false);
    state = toggleCondition(state, "c_pc_ava", "Prone");
    expect(state.combatants.find((x) => x.id === "c_pc_ava")?.conditions).toEqual(["Prone"]);
  });
  it("reads live difficulty from remaining monster HP and PC HP", () => {
    let { state, c } = setup();
    const before = readLiveCombat(rules, state, c.party, []);
    expect(before.encounterXp).toBe(200);
    state = applyDamage(state, "c_mon_goblin_1", 7);
    state = applyDamage(state, "c_mon_goblin_2", 7);
    const after = readLiveCombat(rules, state, c.party, []);
    expect(after.encounterXp).toBe(100);
    state = applyDamage(state, "c_pc_ava", 25);
    state = applyDamage(state, "c_pc_bram", 15);
    expect(pcsInDangerFraction(state)).toBe(0.5);
    expect(readLiveCombat(rules, state, c.party, []).strength.factor).toBeLessThan(1);
  });
  it("suggests tactics from tags and summarizes XP", () => {
    let { state } = setup();
    const tips = suggestTactics(state, rules.monsters);
    expect(tips).toHaveLength(4);
    expect(tips[0]?.text).toContain("Hit and run");
    state = applyDamage(state, "c_mon_goblin_1", 7);
    state = applyDamage(state, "c_mon_goblin_2", 7);
    const s = summarizeCombat(rules, state, []);
    expect(s.xpAward).toBe(100);
    expect(s.xpPerPc).toBe(25);
    expect(s.defeated).toHaveLength(2);
    expect(s.survivors).toHaveLength(2);
  });
});
