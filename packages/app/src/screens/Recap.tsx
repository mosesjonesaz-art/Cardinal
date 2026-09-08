/** Post-session: player-safe recap (spoiler-free) and DM recap, spotlight recording, session close. */
import React, { useState } from "react";
import { buildDmRecap, buildPlayerRecap, findLeaks, spotlightFromEvents } from "@cardinal/core";
import { playerRecapGenerator, type GenerationResult, type PlayerRecap } from "@cardinal/ai";
import { Button, Card, Issues, SourceTag, Tag, TextArea } from "../components/ui.js";
import { useCampaign } from "../state/store.js";

export function RecapScreen() {
  const { campaign, ai, dispatch, settings, toast } = useCampaign();
  const sessions = [...campaign.sessions].sort((a, b) => b.number - a.number);
  const [sessionId, setSessionId] = useState(sessions[0]?.id ?? "");
  const session = campaign.sessions.find((s) => s.id === sessionId);
  const [result, setResult] = useState<GenerationResult<PlayerRecap> | null>(null);
  const [busy, setBusy] = useState(false);
  if (!session) return <p className="empty">No sessions yet. Create one from Prep.</p>;
  const leaks = findLeaks(session.playerRecap, campaign);
  const generate = async () => {
    setBusy(true);
    const r = await ai.run(playerRecapGenerator, { campaign, sessionId }, { timeoutMs: settings.prepTimeoutMs });
    setResult(r);
    dispatch({ type: "setRecap", sessionId, playerRecap: r.output.recap + (r.output.teaser ? `\n\n${r.output.teaser}` : "") });
    setBusy(false);
  };
  const close = () => {
    dispatch({ type: "recordSpotlight", sessionId, weights: spotlightFromEvents(session, campaign.party.members), note: "derived from event log" });
    dispatch({ type: "setRecap", sessionId, dmRecap: buildDmRecap(campaign, sessionId) });
    dispatch({ type: "setSessionStatus", sessionId, status: "complete" }, { snapshotLabel: `session ${session.number} closed` });
    toast(`Session ${session.number} closed; spotlight recorded.`);
  };
  return (
    <div className="stack">
      <div className="row">
        <select value={sessionId} onChange={(e) => { setSessionId(e.target.value); setResult(null); }} style={{ maxWidth: 360 }}>
          {sessions.map((s) => <option key={s.id} value={s.id}>Session {s.number}{s.title ? ` · ${s.title}` : ""} ({s.status})</option>)}
        </select>
        {session.status !== "complete" && <Button onClick={close}>Close session & record spotlight</Button>}
      </div>
      <div className="grid wide">
        <Card title="Player-facing recap (spoiler-free)" right={result && <SourceTag source={result.source} issues={result.issues} />}>
          <p className="muted small">Built only from non-secret events and party-known facts, then scanned for leaks before you see it. Edit freely; copy and post it yourself.</p>
          <div className="row" style={{ marginBottom: 8 }}>
            <Button variant="primary" onClick={() => void generate()} disabled={busy}>{busy ? "Writing…" : "Generate with AI"}</Button>
            <Button onClick={() => dispatch({ type: "setRecap", sessionId, playerRecap: buildPlayerRecap(campaign, sessionId) })}>Plain recap (no AI)</Button>
            <Button onClick={() => void navigator.clipboard?.writeText(session.playerRecap).then(() => toast("Copied"))} disabled={!session.playerRecap}>Copy</Button>
          </div>
          {leaks.length > 0 && <div className="banner danger">This text mentions backstage terms: {leaks.join("; ")}</div>}
          <TextArea value={session.playerRecap} onChange={(v) => dispatch({ type: "setRecap", sessionId, playerRecap: v })} rows={12} />
          {result && <Issues issues={result.issues} />}
        </Card>
        <Card title="DM recap (with secrets & overrides)">
          <pre className="raw" style={{ maxHeight: 400 }}>{session.dmRecap || buildDmRecap(campaign, sessionId)}</pre>
        </Card>
        <Card title={`Event log (${session.events.length})`}>
          <ul className="list small">
            {session.events.map((e) => (
              <li key={e.id}>
                <Tag>{e.kind}</Tag>{e.secret && <Tag kind="secret">secret</Tag>}{e.text}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
