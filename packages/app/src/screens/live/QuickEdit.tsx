/** Principle 3 in one screen: every tracked number editable in one or two taps, no justification required. */
import React, { useState } from "react";
import { factKnowledge, suggestConsequenceTags } from "@cardinal/core";
import { Button, Card, Field, Pills, Stepper, Tag, TextInput } from "../../components/ui.js";
import { useCampaign } from "../../state/store.js";

export function QuickEditView({ sessionId }: { sessionId?: string }) {
  const { campaign, dispatch, toast } = useCampaign();
  const [flagKey, setFlagKey] = useState("");
  const [note, setNote] = useState("");
  const [noteKind, setNoteKind] = useState<"narrative" | "choice" | "discovery" | "note">("choice");
  const [noteSecret, setNoteSecret] = useState(false);
  const [notePcs, setNotePcs] = useState<string[]>([]);
  const [consequence, setConsequence] = useState("");

  const logNote = () => {
    if (!sessionId || !note.trim()) return;
    const tags = suggestConsequenceTags(note, noteKind);
    dispatch({ type: "logEvent", sessionId, event: { kind: noteKind, text: note.trim(), secret: noteSecret, pcIds: notePcs, locationId: campaign.party.currentLocationId, tags } });
    if (consequence.trim()) dispatch({ type: "addConsequence", consequence: { description: consequence.trim(), sessionId, affectedPcIds: notePcs, earliestSessionNumber: (campaign.sessions.find((s) => s.id === sessionId)?.number ?? 0) + 1, tags } });
    setNote("");
    setConsequence("");
    toast(tags.length ? `Logged (tags: ${tags.join(", ")})` : "Logged");
  };

  return (
    <div className="grid wide">
      <Card title="Party">
        <div className="row between" style={{ marginBottom: 8 }}>
          <span>Party purse</span>
          <Stepper value={campaign.party.sharedGold} min={0} bigStep={10} onChange={(v) => dispatch({ type: "setGold", target: { shared: true }, value: v })} />
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <Button small onClick={() => dispatch({ type: "rest", kind: "short" }, { snapshotLabel: "short rest" })}>Short rest (all)</Button>
          <Button small onClick={() => dispatch({ type: "rest", kind: "long" }, { snapshotLabel: "long rest" })}>Long rest (all)</Button>
        </div>
        {campaign.party.members.map((pc) => (
          <div key={pc.id} className="card" style={{ marginBottom: 10 }}>
            <div className="row between">
              <strong>{pc.name} <span className="muted small">L{pc.level}</span></strong>
              <span className="muted small">XP {pc.xp}</span>
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="small">HP {pc.currentHp}/{pc.maxHp}{pc.tempHp > 0 && ` (+${pc.tempHp} temp)`}</span>
              <Stepper value={pc.currentHp} min={0} max={pc.maxHp} bigStep={5} onChange={(v) => dispatch({ type: "setPcHp", pcId: pc.id, value: v })} />
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="small">Temp HP</span>
              <Stepper value={pc.tempHp} min={0} onChange={(v) => dispatch({ type: "setPcTempHp", pcId: pc.id, value: v })} />
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="small">Gold</span>
              <Stepper value={pc.gold} min={0} bigStep={10} onChange={(v) => dispatch({ type: "setGold", target: { pcId: pc.id }, value: v })} />
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="small">XP</span>
              <Stepper value={pc.xp} min={0} step={25} bigStep={4} onChange={(v) => dispatch({ type: "setPcXp", pcId: pc.id, value: v })} />
            </div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="small">Level</span>
              <Stepper value={pc.level} min={1} max={20} onChange={(v) => dispatch({ type: "setPcLevel", pcId: pc.id, value: v })} />
            </div>
            {pc.spellSlots.length > 0 && (
              <div className="row" style={{ marginTop: 6 }}>
                {pc.spellSlots.map((s) => (
                  <span key={s.level} className="row" style={{ gap: 4 }}>
                    <span className="muted small">L{s.level}</span>
                    <Stepper value={s.max - s.used} min={0} max={s.max} onChange={(v) => dispatch({ type: "useSpellSlot", pcId: pc.id, level: s.level, delta: s.max - v - s.used })} />
                  </span>
                ))}
              </div>
            )}
            {pc.resources.map((r) => (
              <div key={r.name} className="row between" style={{ marginTop: 6 }}>
                <span className="small">{r.name} ({r.max - r.used}/{r.max})</span>
                <Stepper value={r.max - r.used} min={0} max={r.max} onChange={(v) => dispatch({ type: "useResource", pcId: pc.id, name: r.name, delta: r.max - v - r.used })} />
              </div>
            ))}
            {pc.inventory.length > 0 && <div className="muted small" style={{ marginTop: 6 }}>Carries: {pc.inventory.map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}</div>}
          </div>
        ))}
      </Card>
      <div className="stack">
        <Card title="Log what just happened">
          <Field label="Kind"><Pills options={[{ value: "choice", label: "Choice" }, { value: "narrative", label: "Narrative" }, { value: "discovery", label: "Discovery" }, { value: "note", label: "Note" }]} value={noteKind} onChange={setNoteKind} /></Field>
          <Field label="Who"><div className="pill-row">{campaign.party.members.map((m) => <button key={m.id} type="button" className={notePcs.includes(m.id) ? "active" : ""} onClick={() => setNotePcs(notePcs.includes(m.id) ? notePcs.filter((x) => x !== m.id) : [...notePcs, m.id])}>{m.name}</button>)}</div></Field>
          <Field label="What"><TextInput value={note} onChange={setNote} placeholder="Ava spared the goblin boss and let him run" /></Field>
          <Field label="Consequence to resurface later (optional)"><TextInput value={consequence} onChange={setConsequence} placeholder="The goblin boss owes Ava; his tribe stops raiding the road" /></Field>
          <div className="row between">
            <Button small onClick={() => setNoteSecret(!noteSecret)}>{noteSecret ? "🔒 Secret (DM only)" : "Players saw this"}</Button>
            <Button variant="primary" onClick={logNote} disabled={!sessionId || !note.trim()}>Log</Button>
          </div>
          {!sessionId && <p className="muted small">Start a session (top right) to log events.</p>}
        </Card>
        <Card title="Quest flags & reputation">
          {Object.entries(campaign.world.flags).map(([k, v]) => (
            <div key={k} className="row between" style={{ padding: "4px 0" }}>
              <span className="mono small">{k}</span>
              {typeof v === "boolean" ? <Button small variant={v ? "primary" : ""} onClick={() => dispatch({ type: "setFlag", key: k, value: !v })}>{v ? "true" : "false"}</Button> : typeof v === "number" ? <Stepper value={v} onChange={(n) => dispatch({ type: "setFlag", key: k, value: n })} /> : <span className="small">{String(v)}</span>}
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <input type="text" value={flagKey} placeholder="new.flag.name" onChange={(e) => setFlagKey(e.target.value)} style={{ flex: 1 }} />
            <Button small onClick={() => { if (flagKey.trim()) dispatch({ type: "setFlag", key: flagKey.trim(), value: true }); setFlagKey(""); }}>Add</Button>
          </div>
          <h3 style={{ marginTop: 12 }}>Factions</h3>
          {campaign.world.factions.map((f) => (
            <div key={f.id} className="row between" style={{ padding: "4px 0" }}>
              <span>{f.secret && <Tag kind="secret">secret</Tag>}{f.name}</span>
              <Stepper value={f.reputation} min={-100} max={100} bigStep={5} onChange={(v) => dispatch({ type: "setReputation", factionId: f.id, value: v })} />
            </div>
          ))}
        </Card>
        <Card title="Reveal a fact (fog of knowledge)">
          <ul className="list small">
            {campaign.world.facts.filter((f) => f.secret).map((f) => {
              const k = factKnowledge(campaign, f.id);
              return (
                <li key={f.id}>
                  <div>{f.statement} {k?.scope === "party" ? <Tag kind="ok">party knows</Tag> : k?.scope === "pc" ? <Tag kind="warn">{k.pcIds.map((id) => campaign.party.members.find((m) => m.id === id)?.name).join(", ")} only</Tag> : <Tag kind="secret">backstage</Tag>}</div>
                  <div className="row" style={{ marginTop: 4 }}>
                    {k?.scope !== "party" && <Button small onClick={() => { dispatch({ type: "revealFact", factId: f.id }); if (sessionId) dispatch({ type: "logEvent", sessionId, event: { kind: "discovery", text: `The party learned: ${f.statement}` } }); }}>Party learns it</Button>}
                    {campaign.party.members.filter((m) => !m.privateKnowledge.includes(f.id)).map((m) => <Button key={m.id} small onClick={() => dispatch({ type: "revealFact", factId: f.id, pcId: m.id })}>{m.name} only</Button>)}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
