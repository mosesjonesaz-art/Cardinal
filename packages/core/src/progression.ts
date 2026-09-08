import type { RulesetConfig } from "./ruleset.js";
import type { PlayerCharacter } from "./schema.js";

export function levelForXp(config: RulesetConfig, xp: number): number {
  const t = config.progression.levelXpThresholds;
  let level = 1;
  for (let i = 0; i < t.length; i++) {
    if (xp >= (t[i] as number)) level = i + 1;
  }
  return Math.min(20, level);
}

export function xpToNextLevel(config: RulesetConfig, xp: number): number | null {
  const level = levelForXp(config, xp);
  if (level >= 20) return null;
  return (config.progression.levelXpThresholds[level] as number) - xp;
}

export function proficiencyBonus(config: RulesetConfig, level: number): number {
  return config.progression.proficiencyBonus[Math.min(20, Math.max(1, level)) - 1] as number;
}

/** PCs whose XP now exceeds their recorded level (never auto-applied; DM confirms). */
export function pendingLevelUps(config: RulesetConfig, members: PlayerCharacter[]): { pcId: string; name: string; from: number; to: number }[] {
  return members
    .map((m) => ({ pcId: m.id, name: m.name, from: m.level, to: levelForXp(config, m.xp) }))
    .filter((x) => x.to > x.from);
}

export function splitXp(total: number, count: number): number {
  return count > 0 ? Math.floor(total / count) : 0;
}
