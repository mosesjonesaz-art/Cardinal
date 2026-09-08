/** Initiative tracker and live-combat helpers. Pure; the UI owns persistence. */
import type { RulesetConfig } from "./ruleset.js";
import { xpForCr } from "./ruleset.js";
import type { Campaign, Encounter, Party, StatBlock } from "./schema.js";
import { readEncounter, type EncounterRead, type MonsterGroup } from "./encounter.js";

export interface Combatant {
  id: string;
  name: string;
  kind: "pc" | "monster" | "ally";
  /** PC id or stat block id. */
  refId: string;
  initiative: number;
  hp: number;
  maxHp: number;
  armorClass: number;
  conditions: string[];
  notes: string;
  /** Distinguishes multiple monsters of the same stat block ("Goblin 2"). */
  ordinal?: number;
}

export interface CombatState {
  id: string;
  encounterId?: string;
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  log: { round: number; text: string }[];
  status: "running" | "ended";
}

export interface StartCombatInput {
  id: string;
  encounter?: Encounter;
  party: Party;
  statBlocks: readonly StatBlock[];
  /** Initiative per PC id (rolled at the table). Missing PCs get 10. */
  pcInitiatives: Record<string, number>;
  /** Initiative per stat block id (one roll per group). Missing get 10. */
  monsterInitiatives?: Record<string, number>;
}

export function startCombat(input: StartCombatInput): CombatState {
  const combatants: Combatant[] = [];
  for (const pc of input.party.members) {
    combatants.push({
      id: `c_${pc.id}`,
      name: pc.name,
      kind: "pc",
      refId: pc.id,
      initiative: input.pcInitiatives[pc.id] ?? 10,
      hp: pc.currentHp,
      maxHp: pc.maxHp,
      armorClass: pc.armorClass,
      conditions: [],
      notes: "",
    });
  }
  if (input.encounter) {
    for (const m of input.encounter.monsters) {
      const sb = input.statBlocks.find((s) => s.id === m.statBlockId);
      if (!sb) continue;
      for (let i = 1; i <= m.count; i++) {
        combatants.push({
          id: `c_${sb.id}_${i}`,
          name: m.count > 1 ? `${sb.name} ${i}` : sb.name,
          kind: "monster",
          refId: sb.id,
          initiative: input.monsterInitiatives?.[sb.id] ?? 10,
          hp: sb.hitPoints,
          maxHp: sb.hitPoints,
          armorClass: sb.armorClass,
          conditions: [],
          notes: "",
          ordinal: i,
        });
      }
    }
  }
  return {
    id: input.id,
    encounterId: input.encounter?.id,
    round: 1,
    turnIndex: 0,
    combatants: sortByInitiative(combatants),
    log: [{ round: 1, text: "Combat begins." }],
    status: "running",
  };
}

export function sortByInitiative(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => b.initiative - a.initiative || (a.kind === "pc" ? -1 : 1));
}

export function currentCombatant(state: CombatState): Combatant | undefined {
  const alive = state.combatants;
  return alive[state.turnIndex];
}

export function nextTurn(state: CombatState): CombatState {
  if (state.combatants.length === 0) return state;
  let idx = state.turnIndex;
  let round = state.round;
  for (let i = 0; i < state.combatants.length; i++) {
    idx += 1;
    if (idx >= state.combatants.length) {
      idx = 0;
      round += 1;
    }
    const c = state.combatants[idx] as Combatant;
    if (c.hp > 0 || c.kind === "pc") break; // dead monsters are skipped; PCs at 0 still get death saves
  }
  const log = round !== state.round ? [...state.log, { round, text: `Round ${round}.` }] : state.log;
  return { ...state, turnIndex: idx, round, log };
}

export function applyDamage(state: CombatState, combatantId: string, amount: number): CombatState {
  return updateCombatant(state, combatantId, (c) => ({ ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp - Math.round(amount))) }), `${amount >= 0 ? "Damage" : "Healing"} ${Math.abs(amount)}`);
}

export function setHp(state: CombatState, combatantId: string, hp: number): CombatState {
  return updateCombatant(state, combatantId, (c) => ({ ...c, hp: Math.max(0, Math.round(hp)) }), `HP set to ${hp}`);
}

export function toggleCondition(state: CombatState, combatantId: string, condition: string): CombatState {
  return updateCombatant(
    state,
    combatantId,
    (c) => ({ ...c, conditions: c.conditions.includes(condition) ? c.conditions.filter((x) => x !== condition) : [...c.conditions, condition] }),
    `Condition ${condition} toggled`,
  );
}

export function addCombatant(state: CombatState, combatant: Combatant): CombatState {
  const combatants = sortByInitiative([...state.combatants, combatant]);
  const current = state.combatants[state.turnIndex];
  const turnIndex = current ? Math.max(0, combatants.findIndex((c) => c.id === current.id)) : 0;
  return { ...state, combatants, turnIndex, log: [...state.log, { round: state.round, text: `${combatant.name} joins the fight.` }] };
}

export function removeCombatant(state: CombatState, combatantId: string): CombatState {
  const removed = state.combatants.find((c) => c.id === combatantId);
  const current = state.combatants[state.turnIndex];
  const combatants = state.combatants.filter((c) => c.id !== combatantId);
  let turnIndex = current && current.id !== combatantId ? combatants.findIndex((c) => c.id === current.id) : state.turnIndex;
  if (turnIndex < 0 || turnIndex >= combatants.length) turnIndex = 0;
  return { ...state, combatants, turnIndex, log: removed ? [...state.log, { round: state.round, text: `${removed.name} leaves the fight.` }] : state.log };
}

export function addMonsterFromStatBlock(state: CombatState, sb: StatBlock, initiative: number): CombatState {
  const existing = state.combatants.filter((c) => c.refId === sb.id).length;
  return addCombatant(state, {
    id: `c_${sb.id}_${existing + 1}_${state.round}`,
    name: `${sb.name} ${existing + 1}`,
    kind: "monster",
    refId: sb.id,
    initiative,
    hp: sb.hitPoints,
    maxHp: sb.hitPoints,
    armorClass: sb.armorClass,
    conditions: [],
    notes: "",
    ordinal: existing + 1,
  });
}

function updateCombatant(state: CombatState, id: string, fn: (c: Combatant) => Combatant, logText: string): CombatState {
  const idx = state.combatants.findIndex((c) => c.id === id);
  if (idx === -1) return state;
  const combatants = [...state.combatants];
  const before = combatants[idx] as Combatant;
  combatants[idx] = fn(before);
  return { ...state, combatants, log: [...state.log, { round: state.round, text: `${before.name}: ${logText}` }] };
}

/** Live difficulty read: remaining monster HP scales their XP; PC HP comes from the tracker. */
export function readLiveCombat(config: RulesetConfig, state: CombatState, party: Party, statBlocks: readonly StatBlock[]): EncounterRead {
  const all = [...statBlocks, ...config.monsters];
  const byRef = new Map<string, { sb: StatBlock; hp: number; max: number; count: number }>();
  for (const c of state.combatants) {
    if (c.kind !== "monster") continue;
    const sb = all.find((s) => s.id === c.refId);
    if (!sb) continue;
    const cur = byRef.get(c.refId) ?? { sb, hp: 0, max: 0, count: 0 };
    cur.hp += c.hp;
    cur.max += c.maxHp;
    cur.count += 1;
    byRef.set(c.refId, cur);
  }
  // XP remaining scales with the group's remaining HP (dead members contribute 0).
  const groups: MonsterGroup[] = [...byRef.values()]
    .filter((g) => g.hp > 0)
    .map((g) => ({ statBlock: g.sb, count: g.count, hpFraction: g.max > 0 ? g.hp / g.max : 1 }));
  const liveParty: Party = {
    ...party,
    members: party.members.map((m) => {
      const c = state.combatants.find((x) => x.kind === "pc" && x.refId === m.id);
      return c ? { ...m, currentHp: c.hp } : m;
    }),
  };
  return readEncounter(config, liveParty, groups);
}

export function pcsInDangerFraction(state: CombatState): number {
  const pcs = state.combatants.filter((c) => c.kind === "pc");
  if (pcs.length === 0) return 0;
  return pcs.filter((c) => c.maxHp > 0 && c.hp / c.maxHp <= 0.25).length / pcs.length;
}

export interface TacticalSuggestion {
  combatantId: string;
  text: string;
}

/** Rule-based enemy tactics from stat-block tags and the board state. The LLM layer can elaborate. */
export function suggestTactics(state: CombatState, statBlocks: readonly StatBlock[]): TacticalSuggestion[] {
  const out: TacticalSuggestion[] = [];
  const pcs = state.combatants.filter((c) => c.kind === "pc" && c.hp > 0);
  const weakestPc = [...pcs].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  const lowestAc = [...pcs].sort((a, b) => a.armorClass - b.armorClass)[0];
  const monsters = state.combatants.filter((c) => c.kind === "monster" && c.hp > 0);
  const groupHp = monsters.reduce((s, m) => s + m.hp, 0) / Math.max(1, monsters.reduce((s, m) => s + m.maxHp, 0));
  for (const m of monsters) {
    const sb = statBlocks.find((s) => s.id === m.refId);
    const tags = sb?.tags ?? [];
    const parts: string[] = [];
    if (sb?.tactics) parts.push(sb.tactics);
    if (m.hp / m.maxHp < 0.3 && tags.includes("cowardly")) parts.push("Badly hurt and cowardly: flees or surrenders.");
    else if (groupHp < 0.35 && !tags.includes("fearless")) parts.push("The group is losing; consider a fighting retreat (Principle 2: narrate it, don't fudge).");
    if (tags.includes("pack") && weakestPc) parts.push(`Pack tactics: gang up on ${weakestPc.name}.`);
    if (tags.includes("ranged") && lowestAc) parts.push(`Keep distance; shoot ${lowestAc.name} (lowest AC).`);
    if (tags.includes("brute") && weakestPc) parts.push(`Charge ${weakestPc.name}, the most wounded target.`);
    if (tags.includes("cunning")) parts.push("Targets spellcasters and uses cover; retreats to fight another day.");
    if (parts.length === 0 && weakestPc) parts.push(`Attacks the nearest foe; prefers ${weakestPc.name} if adjacent.`);
    out.push({ combatantId: m.id, text: parts.join(" ") });
  }
  return out;
}

export interface CombatSummary {
  xpAward: number;
  xpPerPc: number;
  defeated: { name: string; refId: string }[];
  survivors: { name: string; refId: string; hp: number }[];
  pcHp: Record<string, number>;
}

export function summarizeCombat(config: RulesetConfig, state: CombatState, statBlocks: readonly StatBlock[]): CombatSummary {
  const all = [...statBlocks, ...config.monsters];
  const defeated = state.combatants.filter((c) => c.kind === "monster" && c.hp <= 0);
  const survivors = state.combatants.filter((c) => c.kind === "monster" && c.hp > 0);
  const xpAward = defeated.reduce((s, c) => {
    const sb = all.find((x) => x.id === c.refId);
    return s + (sb ? xpForCr(config, sb.cr) : 0);
  }, 0);
  const pcs = state.combatants.filter((c) => c.kind === "pc");
  const pcHp: Record<string, number> = {};
  for (const p of pcs) pcHp[p.refId] = p.hp;
  return {
    xpAward,
    xpPerPc: pcs.length ? Math.floor(xpAward / pcs.length) : 0,
    defeated: defeated.map((c) => ({ name: c.name, refId: c.refId })),
    survivors: survivors.map((c) => ({ name: c.name, refId: c.refId, hp: c.hp })),
    pcHp,
  };
}

/** Looks up a stat block from the campaign first, then the ruleset. */
export function findStatBlock(campaign: Campaign, config: RulesetConfig, id: string): StatBlock | undefined {
  return campaign.world.statBlocks.find((s) => s.id === id) ?? config.monsters.find((s) => s.id === id);
}
