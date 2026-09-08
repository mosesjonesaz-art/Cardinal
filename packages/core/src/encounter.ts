/**
 * Encounter math for D&D 5e (2024). Pure functions over the ruleset config.
 *
 * 2024 rules: XP budget = sum over characters of the per-level Low/Moderate/High
 * value; encounter XP = plain sum of monster XP (no group multiplier unless the
 * config re-enables one).
 *
 * Cardinal extension: the "current-state" read scales the budget by a party
 * strength factor derived from remaining HP, spell slots and other resources,
 * so a High fight against a depleted party reads as Deadly. Everything is
 * explained in `explanation` so the DM can see the math.
 */
import type { RulesetConfig } from "./ruleset.js";
import { xpForCr } from "./ruleset.js";
import type { Encounter, Party, PlayerCharacter, StatBlock } from "./schema.js";
import type { DifficultyBudget } from "./ruleset.js";

export type Difficulty = "trivial" | "low" | "moderate" | "high" | "deadly";
export const DIFFICULTY_ORDER: readonly Difficulty[] = ["trivial", "low", "moderate", "high", "deadly"];

export interface PcResourceSnapshot {
  pcId: string;
  name: string;
  level: number;
  hpFraction: number;
  slotFraction: number | null;
  resourceFraction: number | null;
}

export interface PartyStrength {
  /** Multiplier applied to the full-rest budget (floor..ceiling). */
  factor: number;
  members: PcResourceSnapshot[];
  explanation: string[];
}

export interface EncounterRead {
  encounterXp: number;
  monsterCount: number;
  budgetFull: DifficultyBudget;
  budgetEffective: DifficultyBudget;
  difficultyAtFullRest: Difficulty;
  difficultyNow: Difficulty;
  strength: PartyStrength;
  /** XP award if the party defeats everything. */
  xpAward: number;
  explanation: string[];
  flags: BalanceFlag[];
}

export interface BalanceFlag {
  code: "TOO_EASY" | "TOO_HARD" | "DEADLY_NOW" | "PARTY_DEPLETED" | "NO_MONSTERS" | "UNKNOWN_STATBLOCK";
  message: string;
}

export function pcResourceSnapshot(pc: PlayerCharacter): PcResourceSnapshot {
  const hpFraction = pc.maxHp > 0 ? Math.min(1, (pc.currentHp + pc.tempHp) / pc.maxHp) : 0;
  const slotMax = pc.spellSlots.reduce((s, x) => s + x.max * x.level, 0);
  const slotLeft = pc.spellSlots.reduce((s, x) => s + Math.max(0, x.max - x.used) * x.level, 0);
  const resMax = pc.resources.reduce((s, r) => s + r.max, 0);
  const resLeft = pc.resources.reduce((s, r) => s + Math.max(0, r.max - r.used), 0);
  return {
    pcId: pc.id,
    name: pc.name,
    level: pc.level,
    hpFraction,
    slotFraction: slotMax > 0 ? slotLeft / slotMax : null,
    resourceFraction: resMax > 0 ? resLeft / resMax : null,
  };
}

export function partyStrength(config: RulesetConfig, party: Party): PartyStrength {
  const s = config.encounter.resourceScaling;
  const members = party.members.map(pcResourceSnapshot);
  const explanation: string[] = [];
  if (members.length === 0) return { factor: 1, members, explanation: ["No party members; strength factor 1.0"] };
  let total = 0;
  for (const m of members) {
    let weight = s.hpWeight;
    let score = m.hpFraction * s.hpWeight;
    if (m.slotFraction !== null) {
      weight += s.slotWeight;
      score += m.slotFraction * s.slotWeight;
    }
    if (m.resourceFraction !== null) {
      weight += s.resourceWeight;
      score += m.resourceFraction * s.resourceWeight;
    }
    const memberFactor = weight > 0 ? score / weight : 1;
    total += memberFactor;
    explanation.push(
      `${m.name}: HP ${pct(m.hpFraction)}` +
        (m.slotFraction !== null ? `, slots ${pct(m.slotFraction)}` : "") +
        (m.resourceFraction !== null ? `, resources ${pct(m.resourceFraction)}` : "") +
        ` → ${memberFactor.toFixed(2)}`,
    );
  }
  const raw = total / members.length;
  const factor = Math.min(s.ceiling, Math.max(s.floor, raw));
  explanation.push(`Party strength factor ${factor.toFixed(2)} (raw ${raw.toFixed(2)}, floor ${s.floor}, ceiling ${s.ceiling})`);
  return { factor, members, explanation };
}

export function xpBudget(config: RulesetConfig, levels: number[]): DifficultyBudget {
  const out = { low: 0, moderate: 0, high: 0 };
  for (const level of levels) {
    const row = config.encounter.xpBudgetPerCharacter[String(Math.min(20, Math.max(1, Math.round(level))))];
    if (!row) throw new Error(`No XP budget row for level ${level}`);
    out.low += row.low;
    out.moderate += row.moderate;
    out.high += row.high;
  }
  return out;
}

export function scaleBudget(budget: DifficultyBudget, factor: number): DifficultyBudget {
  return {
    low: Math.round(budget.low * factor),
    moderate: Math.round(budget.moderate * factor),
    high: Math.round(budget.high * factor),
  };
}

export function monsterCountMultiplier(config: RulesetConfig, count: number): number {
  const rows = [...config.encounter.monsterCountMultiplier].sort((a, b) => a.upToCount - b.upToCount);
  for (const r of rows) if (count <= r.upToCount) return r.multiplier;
  return rows.length ? (rows[rows.length - 1] as (typeof rows)[number]).multiplier : 1;
}

export interface MonsterGroup {
  statBlock: StatBlock;
  count: number;
  /** 0..1 remaining hit points across the group (live combat). Defaults to 1. */
  hpFraction?: number;
}

export function encounterXp(config: RulesetConfig, groups: MonsterGroup[]): { total: number; adjusted: number; count: number } {
  let total = 0;
  let count = 0;
  for (const g of groups) {
    const xp = xpForCr(config, g.statBlock.cr);
    total += xp * g.count * (g.hpFraction ?? 1);
    count += g.count;
  }
  const adjusted = Math.round(total * monsterCountMultiplier(config, count));
  return { total: Math.round(total), adjusted, count };
}

export function classifyDifficulty(config: RulesetConfig, xp: number, budget: DifficultyBudget): Difficulty {
  const { deadlyMultiplier, trivialFraction } = config.encounter;
  if (xp > budget.high * deadlyMultiplier) return "deadly";
  if (xp >= budget.high) return "high";
  if (xp >= budget.moderate) return "moderate";
  if (xp >= budget.low * trivialFraction) return "low";
  return "trivial";
}

export function resolveMonsterGroups(
  encounter: Pick<Encounter, "monsters">,
  statBlocks: readonly StatBlock[],
): { groups: MonsterGroup[]; missing: string[] } {
  const groups: MonsterGroup[] = [];
  const missing: string[] = [];
  for (const m of encounter.monsters) {
    const sb = statBlocks.find((s) => s.id === m.statBlockId);
    if (!sb) missing.push(m.statBlockId);
    else groups.push({ statBlock: sb, count: m.count });
  }
  return { groups, missing };
}

/** Full read of an encounter against the party's CURRENT state. */
export function readEncounter(config: RulesetConfig, party: Party, groups: MonsterGroup[], opts: { missingStatBlocks?: string[] } = {}): EncounterRead {
  const levels = party.members.map((m) => m.level);
  const budgetFull = xpBudget(config, levels);
  const strength = partyStrength(config, party);
  const budgetEffective = scaleBudget(budgetFull, strength.factor);
  const { total, adjusted, count } = encounterXp(config, groups);
  const difficultyAtFullRest = classifyDifficulty(config, adjusted, budgetFull);
  const difficultyNow = classifyDifficulty(config, adjusted, budgetEffective);
  const flags: BalanceFlag[] = [];
  const explanation: string[] = [
    `Party levels ${levels.join(", ") || "(none)"} → budget L/M/H ${budgetFull.low}/${budgetFull.moderate}/${budgetFull.high} XP at full rest`,
    `Effective budget ×${strength.factor.toFixed(2)} → ${budgetEffective.low}/${budgetEffective.moderate}/${budgetEffective.high} XP right now`,
    `Encounter XP ${adjusted} from ${count} creature(s)` + (adjusted !== total ? ` (raw ${total}, count multiplier applied)` : ""),
    `Reads ${difficultyAtFullRest.toUpperCase()} at full rest, ${difficultyNow.toUpperCase()} now`,
  ];
  if (groups.length === 0) flags.push({ code: "NO_MONSTERS", message: "Encounter has no resolvable monsters." });
  for (const id of opts.missingStatBlocks ?? []) flags.push({ code: "UNKNOWN_STATBLOCK", message: `Stat block ${id} not found.` });
  if (difficultyNow === "deadly") flags.push({ code: "DEADLY_NOW", message: "Given current resources this fight is deadly." });
  else if (difficultyNow === "high" && difficultyAtFullRest !== "high")
    flags.push({ code: "TOO_HARD", message: "This fight is harder than planned because the party is depleted." });
  if (difficultyNow === "trivial") flags.push({ code: "TOO_EASY", message: "This fight is trivial for the party as it stands." });
  if (strength.factor < 0.6) flags.push({ code: "PARTY_DEPLETED", message: `Party strength is ${pct(strength.factor)}; consider a rest opportunity.` });
  return {
    encounterXp: adjusted,
    monsterCount: count,
    budgetFull,
    budgetEffective,
    difficultyAtFullRest,
    difficultyNow,
    strength,
    xpAward: total,
    explanation,
    flags,
  };
}

export function readCampaignEncounter(config: RulesetConfig, party: Party, encounter: Encounter, statBlocks: readonly StatBlock[]): EncounterRead {
  const { groups, missing } = resolveMonsterGroups(encounter, [...statBlocks, ...config.monsters]);
  return readEncounter(config, party, groups, { missingStatBlocks: missing });
}

/** Target XP band for proposing an encounter of a given difficulty against the current party state. */
export function targetXpBand(config: RulesetConfig, party: Party, difficulty: Exclude<Difficulty, "trivial" | "deadly">): { min: number; max: number; effectiveBudget: DifficultyBudget } {
  const levels = party.members.map((m) => m.level);
  const strength = partyStrength(config, party);
  const budget = scaleBudget(xpBudget(config, levels), strength.factor);
  const bands = {
    low: { min: Math.round(budget.low * config.encounter.trivialFraction), max: budget.moderate - 1 },
    moderate: { min: budget.moderate, max: budget.high - 1 },
    high: { min: budget.high, max: Math.round(budget.high * config.encounter.deadlyMultiplier) },
  } as const;
  const b = bands[difficulty];
  return { min: Math.max(0, b.min), max: Math.max(b.min, b.max), effectiveBudget: budget };
}

// ---------- Mid-fight narrative difficulty levers (Principle 2) ----------

export interface DifficultyLever {
  id: string;
  direction: "easier" | "harder";
  title: string;
  /** In-fiction justification the DM can narrate. */
  narrative: string;
  /** What it costs the party / the story so it never feels free. */
  cost: string;
  /** Mechanical effect description; the DM applies it manually (nothing is auto-applied). */
  mechanicalEffect: string;
  /** Approximate change in encounter XP if applied (negative = easier). */
  xpDelta: number;
}

export interface LeverContext {
  read: EncounterRead;
  groups: MonsterGroup[];
  /** Fraction of PCs at or below 25% HP. */
  pcsInDanger: number;
  round: number;
}

/**
 * Proposes levers with a cost attached. Never applied automatically: the DM approves
 * each one and the app then records the resulting change as an override.
 */
export function proposeDifficultyLevers(config: RulesetConfig, ctx: LeverContext): DifficultyLever[] {
  const { read, groups } = ctx;
  const levers: DifficultyLever[] = [];
  const strongest = [...groups].sort((a, b) => b.statBlock.cr - a.statBlock.cr)[0];
  const weakest = [...groups].sort((a, b) => a.statBlock.cr - b.statBlock.cr)[0];
  const tooHard = read.difficultyNow === "deadly" || (read.difficultyNow === "high" && ctx.pcsInDanger >= 0.5);
  const tooEasy = read.difficultyNow === "trivial" || (read.difficultyNow === "low" && ctx.round >= 2);

  if (tooHard && weakest) {
    const xp = xpForCr(config, weakest.statBlock.cr);
    levers.push({
      id: "retreat",
      direction: "easier",
      title: `${weakest.statBlock.name}s break and flee`,
      narrative: `Morale cracks: the ${weakest.statBlock.name}s scatter, dragging the wounded away.`,
      cost: "They escape with what they know. Tag a consequence: they report the party's tactics to whoever sent them.",
      mechanicalEffect: `Remove up to ${weakest.count} ${weakest.statBlock.name}(s) from initiative on their next turn.`,
      xpDelta: -xp * weakest.count,
    });
  }
  if (tooHard && strongest) {
    levers.push({
      id: "weakness",
      direction: "easier",
      title: `A weakness in the ${strongest.statBlock.name} is revealed`,
      narrative: `A PC notices something (an old wound, a ritual focus, an exposed flank) that the ${strongest.statBlock.name} is protecting.`,
      cost: "Exploiting it costs an action or a check first; the reveal is a clue, not a free hit.",
      mechanicalEffect: "Attacks that target the weakness deal +1d6 (or the creature loses a trait) after a successful DC 13 check.",
      xpDelta: -Math.round(xpForCr(config, strongest.statBlock.cr) * 0.3),
    });
  }
  if (tooHard) {
    levers.push({
      id: "ally",
      direction: "easier",
      title: "An NPC with their own agenda intervenes",
      narrative: "Someone the party has met (or crossed) arrives with reinforcements of their own.",
      cost: "The party now owes a debt, or the NPC's faction gains leverage. Record the favour as a consequence.",
      mechanicalEffect: "Add an allied combatant; it acts on initiative 10 and leaves when the fight ends.",
      xpDelta: -Math.round(read.encounterXp * 0.25),
    });
    levers.push({
      id: "environment",
      direction: "easier",
      title: "The environment offers an out",
      narrative: "A collapsing bridge, a bolt-hole, rising water: the scene gives the party a way to end the fight on their terms.",
      cost: "Taking it means abandoning loot, a captive, or the objective for now.",
      mechanicalEffect: "PCs who spend a move to reach the feature end their engagement; enemies do not pursue this round.",
      xpDelta: -Math.round(read.encounterXp * 0.5),
    });
  }
  if (tooEasy && strongest) {
    const xp = xpForCr(config, strongest.statBlock.cr);
    levers.push({
      id: "reinforcements",
      direction: "harder",
      title: "Reinforcements answer the noise",
      narrative: `The clash draws another ${strongest.statBlock.name} (or two) from nearby.`,
      cost: "The party's position is now known; stealth options in this location are gone.",
      mechanicalEffect: `Add ${strongest.statBlock.name} ×1 at the top of next round.`,
      xpDelta: xp,
    });
    levers.push({
      id: "objective",
      direction: "harder",
      title: "A ticking objective appears",
      narrative: "An enemy starts a ritual, lights a signal fire, or drags a hostage toward the exit.",
      cost: "Ignoring it has a consequence the DM tags now; stopping it costs actions.",
      mechanicalEffect: "Countdown of 3 rounds; an enemy must be interrupted or the objective completes.",
      xpDelta: Math.round(read.encounterXp * 0.25),
    });
  }
  if (tooEasy) {
    levers.push({
      id: "terrain",
      direction: "harder",
      title: "The terrain turns against the party",
      narrative: "Smoke, darkness, or unstable footing changes the fight.",
      cost: "None for the enemies; the party loses easy sightlines and may need to reposition.",
      mechanicalEffect: "Lightly obscured area (disadvantage on Perception); difficult terrain in a 10-ft band.",
      xpDelta: Math.round(read.encounterXp * 0.15),
    });
  }
  return levers;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
