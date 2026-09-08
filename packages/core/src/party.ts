/** Party helpers: resource state and cross-session spotlight balancing. */
import type { Campaign, Party, PlayerCharacter, Session } from "./schema.js";

export interface SpotlightSummary {
  pcId: string;
  name: string;
  /** Decayed cumulative share of focus (recent sessions count more). */
  weighted: number;
  /** Plain average share over all recorded sessions. */
  average: number;
  /** Share in the most recent session that recorded spotlight, or null. */
  lastSession: number | null;
  /** Sessions since this PC last had >= fairShare focus. */
  sessionsSinceFocus: number;
  /** Positive = owed spotlight. Difference between fair share and weighted share. */
  deficit: number;
}

export interface SpotlightOptions {
  /** Per-session decay factor for older sessions (0..1). */
  decay?: number;
}

export function spotlightSummary(party: Party, sessions: Session[], opts: SpotlightOptions = {}): SpotlightSummary[] {
  const decay = opts.decay ?? 0.7;
  const ordered = [...sessions].sort((a, b) => a.number - b.number);
  const n = party.members.length;
  const fair = n > 0 ? 1 / n : 0;
  const withSpotlight = ordered.filter((s) => party.members.some((m) => m.spotlight.some((e) => e.sessionId === s.id)));
  return party.members.map((pc) => {
    let weighted = 0;
    let weightSum = 0;
    let sum = 0;
    let count = 0;
    let lastSession: number | null = null;
    let sessionsSinceFocus = withSpotlight.length;
    withSpotlight.forEach((s, i) => {
      const age = withSpotlight.length - 1 - i;
      const w = Math.pow(decay, age);
      const entry = pc.spotlight.find((e) => e.sessionId === s.id);
      const share = entry?.weight ?? 0;
      weighted += share * w;
      weightSum += w;
      sum += share;
      count += 1;
      lastSession = share;
      if (share >= fair * 0.9) sessionsSinceFocus = age;
    });
    const weightedShare = weightSum > 0 ? weighted / weightSum : fair;
    return {
      pcId: pc.id,
      name: pc.name,
      weighted: weightedShare,
      average: count > 0 ? sum / count : fair,
      lastSession,
      sessionsSinceFocus,
      deficit: fair - weightedShare,
    };
  });
}

/** Ordered list: who should get focus next session, most-owed first. */
export function spotlightForecast(party: Party, sessions: Session[], opts?: SpotlightOptions): SpotlightSummary[] {
  return [...spotlightSummary(party, sessions, opts)].sort((a, b) => b.deficit - a.deficit || b.sessionsSinceFocus - a.sessionsSinceFocus);
}

/** Derives spotlight weights for a session from its event log (share of events each PC is tagged in). */
export function spotlightFromEvents(session: Session, members: PlayerCharacter[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const m of members) counts[m.id] = 0;
  let total = 0;
  for (const e of session.events) {
    for (const pcId of e.pcIds) {
      if (pcId in counts) {
        counts[pcId] = (counts[pcId] ?? 0) + 1;
        total += 1;
      }
    }
  }
  const out: Record<string, number> = {};
  for (const m of members) out[m.id] = total > 0 ? (counts[m.id] ?? 0) / total : members.length ? 1 / members.length : 0;
  return out;
}

export function findPc(campaign: Campaign, pcId: string): PlayerCharacter | undefined {
  return campaign.party.members.find((m) => m.id === pcId);
}

export function openGoals(pc: PlayerCharacter) {
  return pc.goals.filter((g) => g.status === "open" || g.status === "progressing");
}
