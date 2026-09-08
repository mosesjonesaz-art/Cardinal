/** Deterministic recaps from the event log. The LLM layer can polish prose; this is the fail-soft baseline. */
import { playerSafeView } from "./knowledge.js";
import type { Campaign, Session } from "./schema.js";

export function findSession(campaign: Campaign, sessionId: string): Session | undefined {
  return campaign.sessions.find((s) => s.id === sessionId);
}

export function latestSession(campaign: Campaign): Session | undefined {
  return [...campaign.sessions].sort((a, b) => b.number - a.number)[0];
}

/** Player-safe recap: only non-secret events, phrased as plain bullets. */
export function buildPlayerRecap(campaign: Campaign, sessionId: string): string {
  const session = findSession(campaign, sessionId);
  if (!session) return "";
  const view = playerSafeView(campaign, sessionId);
  const lines: string[] = [`Session ${session.number}${session.title ? `: ${session.title}` : ""}`, ""];
  if (view.events.length === 0) lines.push("(No shareable events were logged this session.)");
  for (const e of view.events) lines.push(`- ${e.text}`);
  const discovered = campaign.world.locations.filter((l) => l.discoveredByParty && session.events.some((e) => !e.secret && e.locationId === l.id));
  if (discovered.length) lines.push("", `Places visited: ${discovered.map((l) => l.name).join(", ")}`);
  return lines.join("\n");
}

/** DM recap: every event, secrets marked, plus overrides made during the session. */
export function buildDmRecap(campaign: Campaign, sessionId: string): string {
  const session = findSession(campaign, sessionId);
  if (!session) return "";
  const lines: string[] = [`Session ${session.number} (DM notes)`, ""];
  for (const e of session.events) lines.push(`- [${e.kind}${e.secret ? ", SECRET" : ""}] ${e.text}`);
  const first = session.events[0]?.at;
  const last = session.events[session.events.length - 1]?.at;
  const overrides = campaign.overrides.filter((o) => first && last && o.at >= first && o.at <= last);
  if (overrides.length) {
    lines.push("", "Overrides during session:");
    for (const o of overrides) lines.push(`- ${o.path}: ${JSON.stringify(o.previous)} → ${JSON.stringify(o.next)}${o.reason ? ` (${o.reason})` : ""}`);
  }
  const pending = campaign.consequences.filter((c) => c.sessionId === sessionId);
  if (pending.length) {
    lines.push("", "Consequences tagged:");
    for (const c of pending) lines.push(`- [${c.severity}] ${c.description}`);
  }
  return lines.join("\n");
}
