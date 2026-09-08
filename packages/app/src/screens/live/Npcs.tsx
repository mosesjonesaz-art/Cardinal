import React, { useEffect, useState } from "react";
import { consequencesForNpc, type Npc, type NpcMood } from "@cardinal/core";
import { moodVoiceDirective, npcCardGenerator, type GenerationResult, type NpcAssetResult, type NpcCard } from "@cardinal/ai";
import { Button, Card, Field, Issues, Modal, Pills, SourceTag, Spinner, Tag, TextInput } from "../../components/ui.js";
import { useCampaign } from "../../state/store.js";
import { NpcEditor } from "../Setup.js";

const MOODS: NpcMood[] = ["calm", "warm", "wary", "hostile", "afraid", "grieving", "elated", "scheming", "bored", "desperate"];

export function NpcsView({ sessionId }: { sessionId?: string }) {
  const { campaign, ai, assets, dispatch, toast } = useCampaign();
  const here = campaign.party.currentLocationId;
  const sorted = [...campaign.world.npcs].sort((a, b) => Number(b.locationId === here) - Number(a.locationId === here) || a.name.localeCompare(b.name));
  const [selectedId, setSelectedId] = useState<string | null>(sorted.find((n) => n.locationId === here)?.id ?? null);
  const npc = campaign.world.npcs.find((n) => n.id === selectedId);
  const [card, setCard] = useState<GenerationResult<NpcCard> | null>(null);
  const [busy, setBusy] = useState(false);
  const [situation, setSituation] = useState("");
  const [voice, setVoice] = useState<NpcAssetResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [memory, setMemory] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setCard(null);
    setVoice(null);
    if (npc) void assets.getVoiceSample(npc).then(setVoice);
  }, [selectedId]);

  const embody = async () => {
    if (!npc) return;
    setBusy(true);
    setCard(await ai.run(npcCardGenerator, { campaign, npcId: npc.id, situation: situation || undefined }));
    setBusy(false);
  };
  const remember = () => {
    if (!npc || !memory.trim()) return;
    dispatch({ type: "npcRemember", npcId: npc.id, memory: { summary: memory.trim() } });
    if (sessionId) dispatch({ type: "logEvent", sessionId, event: { kind: "npc-interaction", text: `${npc.name}: ${memory.trim()}`, npcIds: [npc.id], locationId: here } });
    setMemory("");
    toast(`${npc.name} will remember that.`);
  };
  const list = sorted.filter((n) => !filter || n.name.toLowerCase().includes(filter.toLowerCase()) || n.role.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="grid wide">
      <Card title="Who">
        <TextInput value={filter} onChange={setFilter} placeholder="filter by name or role" />
        <div className="pill-row" style={{ marginTop: 8 }}>
          {list.map((n) => (
            <button key={n.id} type="button" className={n.id === selectedId ? "active" : ""} onClick={() => setSelectedId(n.id)}>
              {n.name}{n.locationId === here ? " ·" : ""}{n.status === "dead" ? " †" : ""}
            </button>
          ))}
        </div>
        <p className="muted small">· = here now. † = dead (a dead NPC “acting” trips a canon check).</p>
      </Card>
      {npc ? (
        <Card title={npc.name} className={npc.secret ? "secret" : npc.provisional ? "provisional" : ""} right={<span>{npc.secret && <Tag kind="secret">secret</Tag>}<Tag>{npc.status}</Tag><Button small onClick={() => setEditing(true)}>Edit</Button></span>}>
          <div className="muted small">{npc.role}{npc.locationId && ` · ${campaign.world.locations.find((l) => l.id === npc.locationId)?.name}`} · relationship {npc.relationshipToParty}</div>
          <p className="small">{npc.appearance}</p>
          <Field label="Mood (one tap)">
            <Pills options={MOODS.map((m) => ({ value: m, label: m }))} value={npc.mood} onChange={(mood) => dispatch({ type: "setNpcMood", npcId: npc.id, mood })} />
          </Field>
          <div className="readaloud small" style={{ fontFamily: "inherit" }}>{moodVoiceDirective(npc.voice, npc.mood)}</div>
          <div className="muted small" style={{ marginTop: 6 }}>
            Voice sample: {voice ? (voice.source === "unavailable" ? "not available (no voice provider configured) — perform from the cue above" : `${voice.source} · ${voice.key}`) : "…"}
          </div>
          <Field label="Situation (optional)"><TextInput value={situation} onChange={setSituation} placeholder="the party just accused her" /></Field>
          <div className="row"><Button variant="primary" onClick={() => void embody()} disabled={busy}>{busy ? "…" : "Embodiment card"}</Button></div>
          {busy && <Spinner label="Getting into character…" />}
          {card && (
            <div className="stack" style={{ marginTop: 12 }}>
              <SourceTag source={card.source} issues={card.issues} />
              <div className="readaloud">“{card.output.openingLine}”</div>
              <div className="small"><strong>Voice cue:</strong> {card.output.voiceCue}</div>
              {card.output.mannerisms.length > 0 && <div className="small"><strong>Mannerisms:</strong> {card.output.mannerisms.join("; ")}</div>}
              <div className="small"><strong>Wants:</strong> {card.output.wants}</div>
              <div className="small"><strong>History with party:</strong> {card.output.historyWithParty}</div>
              <div className="small"><strong>Mood now:</strong> {card.output.currentMood}{card.output.currentMood !== npc.mood && <Button small onClick={() => dispatch({ type: "setNpcMood", npcId: npc.id, mood: card.output.currentMood })}>apply</Button>}</div>
              {card.output.sampleLines.length > 0 && <ul className="list small">{card.output.sampleLines.map((l, i) => <li key={i}>“{l}”</li>)}</ul>}
              <div className="card secret small">
                <div className="muted">DM only</div>
                {card.output.secretAgenda && <div><strong>Secret agenda:</strong> {card.output.secretAgenda}</div>}
                {card.output.knows.length > 0 && <div><strong>Knows:</strong> {card.output.knows.join(" | ")}</div>}
              </div>
              <Issues issues={card.issues} />
            </div>
          )}
          <h3 style={{ marginTop: 16 }}>Memory & consequences</h3>
          <ul className="list small">
            {npc.memories.slice(-5).map((m, i) => <li key={i}>{m.summary} <span className="muted">({m.sentiment >= 0 ? "+" : ""}{m.sentiment})</span></li>)}
            {consequencesForNpc(campaign, npc.id).map((c) => <li key={c.id}><Tag kind="warn">consequence</Tag>{c.description}</li>)}
          </ul>
          <div className="row">
            <input type="text" value={memory} placeholder="What just happened that they'll remember?" onChange={(e) => setMemory(e.target.value)} style={{ flex: 1 }} />
            <Button onClick={remember} disabled={!memory.trim()}>Remember</Button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted small">Relationship</span>
            <Button small onClick={() => dispatch({ type: "adjustNpcRelationship", npcId: npc.id, delta: -10 })}>−10</Button>
            <Button small onClick={() => dispatch({ type: "adjustNpcRelationship", npcId: npc.id, delta: 10 })}>+10</Button>
            {npc.status === "alive" && <Button small variant="danger" onClick={() => { if (confirm(`Mark ${npc.name} as dead?`)) { dispatch({ type: "setNpcStatus", npcId: npc.id, status: "dead", reason: "died at the table" }); if (sessionId) dispatch({ type: "logEvent", sessionId, event: { kind: "combat", text: `${npc.name} died.`, npcIds: [npc.id], tags: ["death"] } }); } }}>Mark dead</Button>}
            {npc.provisional && <Button small variant="primary" onClick={() => dispatch({ type: "approveProvisional", kind: "npc", id: npc.id })}>Approve into canon</Button>}
          </div>
        </Card>
      ) : (
        <Card title="NPC"><p className="muted">Pick someone.</p></Card>
      )}
      <Modal open={editing} onClose={() => setEditing(false)} title="NPC">
        {npc && editing && <NpcEditor value={npc as Npc} onSave={(n) => { dispatch({ type: "upsertNpc", npc: n }); setEditing(false); }} />}
      </Modal>
    </div>
  );
}
