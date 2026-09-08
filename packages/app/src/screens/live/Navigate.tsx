import React, { useState } from "react";
import { childLocations, locationPath, newId } from "@cardinal/core";
import { locationSceneGenerator, offScriptGenerator, offScriptToRecords, type GenerationResult, type LocationScene, type OffScriptOutput } from "@cardinal/ai";
import { Button, Card, Field, Issues, Modal, SourceTag, Spinner, Tag, TextInput } from "../../components/ui.js";
import { useCampaign } from "../../state/store.js";
import { LocationEditor } from "../Setup.js";
import type { LiveTab } from "../Live.js";

export function NavigateView({ sessionId, goTo }: { sessionId?: string; goTo: (t: LiveTab) => void }) {
  const { campaign, ai, dispatch, toast } = useCampaign();
  const current = campaign.party.currentLocationId ? campaign.world.locations.find((l) => l.id === campaign.party.currentLocationId) : undefined;
  const path = current ? locationPath(campaign, current.id) : [];
  const children = childLocations(campaign, current?.id);
  const siblings = current?.parentId ? childLocations(campaign, current.parentId).filter((l) => l.id !== current.id) : [];
  const [scene, setScene] = useState<GenerationResult<LocationScene> | null>(null);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const [offPrompt, setOffPrompt] = useState("");
  const [off, setOff] = useState<GenerationResult<OffScriptOutput> | null>(null);
  const [editing, setEditing] = useState(false);

  const moveTo = async (locationId: string) => {
    dispatch({ type: "setPartyLocation", locationId });
    if (sessionId) {
      const loc = campaign.world.locations.find((l) => l.id === locationId);
      dispatch({ type: "logEvent", sessionId, event: { kind: "travel", text: `The party moved to ${loc?.name ?? locationId}.`, locationId, pcIds: campaign.party.members.map((m) => m.id) } });
    }
    setBusy(true);
    setScene(null);
    const next = { ...campaign, party: { ...campaign.party, currentLocationId: locationId } };
    setScene(await ai.run(locationSceneGenerator, { campaign: next, locationId, hint: hint || undefined }));
    setBusy(false);
  };
  const describeHere = async () => {
    if (!current) return;
    setBusy(true);
    setScene(await ai.run(locationSceneGenerator, { campaign, locationId: current.id, hint: hint || undefined }));
    setBusy(false);
  };
  const goOffScript = async () => {
    if (!offPrompt.trim()) return;
    setBusy(true);
    setOff(await ai.run(offScriptGenerator, { campaign, dmPrompt: offPrompt.trim(), parentLocationId: current?.parentId ?? current?.id }));
    setBusy(false);
  };
  const acceptOffScript = () => {
    if (!off) return;
    const recs = offScriptToRecords(off.output, current?.parentId ?? current?.id, newId);
    dispatch({ type: "upsertLocation", location: recs.location });
    for (const n of recs.npcs) dispatch({ type: "upsertNpc", npc: n });
    dispatch({ type: "setPartyLocation", locationId: recs.location.id }, { snapshotLabel: "off-script location" });
    if (sessionId) dispatch({ type: "logEvent", sessionId, event: { kind: "travel", text: `The party went off-script to ${recs.location.name}.`, locationId: recs.location.id } });
    toast(`${recs.location.name} added as provisional canon (review it in Setup).`);
    setScene({ output: { readAloud: off.output.readAloud, ambient: [], presentNpcs: recs.npcs.map((n) => ({ npcId: n.id, hook: n.motive })), hooks: recs.location.hooks, dmNotes: [recs.location.secretNotes, ...off.output.canonNotes].filter(Boolean) }, source: off.source, issues: off.issues, logId: off.logId, durationMs: off.durationMs });
    setOff(null);
    setOffPrompt("");
  };

  return (
    <div className="grid wide">
      <Card title={current ? current.name : "Nowhere yet"} right={current && <span>{current.provisional && <Tag kind="warn">provisional</Tag>}<Button small onClick={() => setEditing(true)}>Edit</Button></span>}>
        <div className="muted small">{path.map((p) => p.name).join(" › ") || "Pick a starting location below."}</div>
        <Field label="Hint for the description (optional)"><TextInput value={hint} onChange={setHint} placeholder="at night · after the fire · in the rain" /></Field>
        <div className="row">
          <Button variant="primary" onClick={() => void describeHere()} disabled={!current || busy}>Describe here</Button>
          {current?.parentId && <Button onClick={() => void moveTo(current.parentId!)}>↑ {campaign.world.locations.find((l) => l.id === current.parentId)?.name}</Button>}
        </div>
        {children.length > 0 && <div style={{ marginTop: 12 }}><div className="muted small">Go into</div><div className="pill-row">{children.map((l) => <button key={l.id} type="button" onClick={() => void moveTo(l.id)}>{l.name}{!l.discoveredByParty && " ·"}</button>)}</div></div>}
        {siblings.length > 0 && <div style={{ marginTop: 12 }}><div className="muted small">Nearby</div><div className="pill-row">{siblings.map((l) => <button key={l.id} type="button" onClick={() => void moveTo(l.id)}>{l.name}</button>)}</div></div>}
        {!current && <div className="pill-row" style={{ marginTop: 8 }}>{campaign.world.locations.map((l) => <button key={l.id} type="button" onClick={() => void moveTo(l.id)}>{l.name}</button>)}</div>}
        <div style={{ marginTop: 16 }}>
          <Field label="Off-script: where did they go?"><TextInput value={offPrompt} onChange={setOffPrompt} placeholder="they follow the smugglers' trail into the marsh" /></Field>
          <Button onClick={() => void goOffScript()} disabled={busy || !offPrompt.trim()}>Generate from canon</Button>
        </div>
      </Card>
      <Card title="Scene" right={scene && <SourceTag source={scene.source} issues={scene.issues} />}>
        {busy && <Spinner label="Setting the scene…" />}
        {!busy && !scene && <p className="muted">Move somewhere or tap Describe here.</p>}
        {scene && (
          <div className="stack">
            <div className="readaloud">{scene.output.readAloud}</div>
            {scene.output.ambient.length > 0 && <ul className="list small">{scene.output.ambient.map((a, i) => <li key={i}>{a}</li>)}</ul>}
            {scene.output.presentNpcs.length > 0 && (
              <div>
                <div className="muted small">Present</div>
                <div className="pill-row">{scene.output.presentNpcs.map((p) => { const n = campaign.world.npcs.find((x) => x.id === p.npcId); return <button key={p.npcId} type="button" onClick={() => goTo("npcs")} title={p.hook}>{n?.name ?? p.npcId} — {p.hook}</button>; })}</div>
              </div>
            )}
            {scene.output.hooks.length > 0 && <div><div className="muted small">Hooks</div><ul className="list small">{scene.output.hooks.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
            {scene.output.dmNotes.length > 0 && <div className="card secret"><div className="muted small">DM only</div><ul className="list small">{scene.output.dmNotes.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
            <Issues issues={scene.issues} />
          </div>
        )}
      </Card>
      <Modal open={!!off} onClose={() => setOff(null)} title="Off-script proposal (provisional until you approve)">
        {off && (
          <div className="stack">
            <SourceTag source={off.source} issues={off.issues} />
            <h3>{off.output.location.name} <span className="muted">({off.output.location.kind})</span></h3>
            <div className="readaloud">{off.output.readAloud}</div>
            <p className="small">{off.output.location.description}</p>
            {off.output.location.secretNotes && <div className="card secret small">DM only: {off.output.location.secretNotes}</div>}
            {off.output.npcs.map((n, i) => <div key={i} className="card small"><strong>{n.name}</strong>, {n.role}. {n.appearance} Wants: {n.motive}. {n.secretMotive && <span className="muted">Secret: {n.secretMotive}</span>}</div>)}
            {off.output.canonNotes.length > 0 && <ul className="list small muted">{off.output.canonNotes.map((c, i) => <li key={i}>{c}</li>)}</ul>}
            <Issues issues={off.issues} />
            <div className="row"><Button variant="primary" onClick={acceptOffScript}>Use it (provisional)</Button><Button onClick={() => setOff(null)}>Discard</Button></div>
          </div>
        )}
      </Modal>
      <Modal open={editing} onClose={() => setEditing(false)} title="Location">
        {current && editing && <LocationEditor value={current} onSave={(l) => { dispatch({ type: "upsertLocation", location: l }); setEditing(false); }} />}
      </Modal>
    </div>
  );
}
