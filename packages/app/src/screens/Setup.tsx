/** Session-zero setup: world/tone/house rules, safety tools, feature flags, party, and canon entry. */
import React, { useState } from "react";
import { KNOWN_FEATURE_FLAGS, newId, type Campaign, type Location, type Npc, type PlayerCharacter, type PlotThread, type Fact, type Faction } from "@cardinal/core";
import { Button, Card, Field, Modal, Pills, Stepper, Tag, TextArea, TextInput } from "../components/ui.js";
import { useCampaign } from "../state/store.js";

export function SetupScreen() {
  const { campaign, dispatch } = useCampaign();
  const [view, setView] = useState<"world" | "party" | "canon">("world");
  return (
    <div className="stack">
      <Pills options={[{ value: "world", label: "World & safety" }, { value: "party", label: `Party (${campaign.party.members.length})` }, { value: "canon", label: "Locations, NPCs, threads" }]} value={view} onChange={setView} />
      {view === "world" && <WorldSetup />}
      {view === "party" && <PartySetup />}
      {view === "canon" && <CanonSetup />}
      <p className="muted small">Everything here is DM-only. Lines are never generated; veils stay off-screen. {campaign.overrides.length} override(s) recorded so far.</p>
      <span style={{ display: "none" }}>{String(dispatch)}</span>
    </div>
  );
}

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  return (
    <Field label={label}>
      <div className="stack">
        {items.map((it, i) => (
          <div key={i} className="row between">
            <span>{it}</span>
            <Button small onClick={() => onChange(items.filter((_, j) => j !== i))}>
              Remove
            </Button>
          </div>
        ))}
        <div className="row">
          <input type="text" value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} style={{ flex: 1 }} />
          <Button
            onClick={() => {
              if (draft.trim()) onChange([...items, draft.trim()]);
              setDraft("");
            }}
          >
            Add
          </Button>
        </div>
      </div>
    </Field>
  );
}

function WorldSetup() {
  const { campaign, dispatch } = useCampaign();
  const meta = (patch: Partial<Pick<Campaign, "name" | "setting" | "tone" | "houseRules" | "safety">>) => dispatch({ type: "updateMeta", patch });
  return (
    <div className="grid">
      <Card title="Campaign">
        <Field label="Name">
          <TextInput value={campaign.name} onChange={(v) => meta({ name: v || "Untitled" })} />
        </Field>
        <Field label="Setting">
          <TextArea value={campaign.setting} onChange={(v) => meta({ setting: v })} placeholder="Where and when. One paragraph is plenty." />
        </Field>
        <Field label="Tone">
          <TextInput value={campaign.tone} onChange={(v) => meta({ tone: v })} placeholder="e.g. grim but hopeful; pulpy; cosy horror" />
        </Field>
        <ListEditor label="House rules" items={campaign.houseRules} onChange={(v) => meta({ houseRules: v })} placeholder="e.g. potions are a bonus action" />
      </Card>
      <Card title="Safety tools (lines & veils)">
        <ListEditor label="Lines: never appears in generated content" items={campaign.safety.lines} onChange={(v) => meta({ safety: { ...campaign.safety, lines: v } })} placeholder="e.g. harm to children" />
        <ListEditor label="Veils: may exist off-screen, never described" items={campaign.safety.veils} onChange={(v) => meta({ safety: { ...campaign.safety, veils: v } })} placeholder="e.g. torture" />
        <Field label="Notes">
          <TextArea value={campaign.safety.notes} onChange={(v) => meta({ safety: { ...campaign.safety, notes: v } })} />
        </Field>
      </Card>
      <Card title="Feature flags (per campaign)">
        {Object.entries(KNOWN_FEATURE_FLAGS).map(([flag, label]) => (
          <div key={flag} className="row between" style={{ padding: "8px 0" }}>
            <span>
              {label}
              <br />
              <span className="muted small mono">{flag}</span>
            </span>
            <Button variant={campaign.featureFlags[flag] ? "primary" : ""} onClick={() => dispatch({ type: "setFeatureFlag", flag, enabled: !campaign.featureFlags[flag] })}>
              {campaign.featureFlags[flag] ? "On" : "Off"}
            </Button>
          </div>
        ))}
      </Card>
    </div>
  );
}

function blankPc(): PlayerCharacter {
  return { id: newId("pc"), name: "New character", playerName: "", className: "", species: "", level: 1, xp: 0, maxHp: 10, currentHp: 10, tempHp: 0, armorClass: 10, passivePerception: 10, gold: 0, inventory: [], spellSlots: [], resources: [], goals: [], privateKnowledge: [], spotlight: [], notes: "", tags: [] };
}

function PartySetup() {
  const { campaign, dispatch } = useCampaign();
  const [editing, setEditing] = useState<PlayerCharacter | null>(null);
  return (
    <div className="stack">
      <div className="row">
        <Button variant="primary" onClick={() => setEditing(blankPc())}>
          Add character
        </Button>
        <span className="muted">Shared gold:</span>
        <Stepper value={campaign.party.sharedGold} min={0} onChange={(v) => dispatch({ type: "setGold", target: { shared: true }, value: v })} />
      </div>
      <div className="grid">
        {campaign.party.members.map((pc) => (
          <Card key={pc.id} title={`${pc.name} · ${pc.className || "?"} ${pc.level}`} right={<Button small onClick={() => setEditing(pc)}>Edit</Button>}>
            <div className="muted small">
              {pc.playerName && `Player: ${pc.playerName} · `}HP {pc.currentHp}/{pc.maxHp} · AC {pc.armorClass} · {pc.gold} gp · XP {pc.xp}
            </div>
            {pc.goals.length > 0 && (
              <ul className="list small">
                {pc.goals.map((g) => (
                  <li key={g.id}>
                    {g.secret && <Tag kind="secret">secret</Tag>}
                    {g.text} <span className="muted">({g.status})</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Character">
        {editing && <PcEditor pc={editing} onSave={(pc) => { dispatch({ type: "upsertPc", pc }); setEditing(null); }} onDelete={() => { if (confirm("Remove this character?")) { dispatch({ type: "removePc", pcId: editing.id }); setEditing(null); } }} />}
      </Modal>
    </div>
  );
}

function PcEditor({ pc: initial, onSave, onDelete }: { pc: PlayerCharacter; onSave: (pc: PlayerCharacter) => void; onDelete: () => void }) {
  const [pc, setPc] = useState(initial);
  const set = (patch: Partial<PlayerCharacter>) => setPc((p) => ({ ...p, ...patch }));
  const [goal, setGoal] = useState("");
  const [res, setRes] = useState("");
  return (
    <div className="stack">
      <div className="grid">
        <Field label="Name"><TextInput value={pc.name} onChange={(v) => set({ name: v })} /></Field>
        <Field label="Player"><TextInput value={pc.playerName} onChange={(v) => set({ playerName: v })} /></Field>
        <Field label="Class"><TextInput value={pc.className} onChange={(v) => set({ className: v })} /></Field>
        <Field label="Species"><TextInput value={pc.species} onChange={(v) => set({ species: v })} /></Field>
      </div>
      <div className="row" style={{ gap: 24 }}>
        <Field label="Level"><Stepper value={pc.level} min={1} max={20} onChange={(v) => set({ level: v })} /></Field>
        <Field label="Max HP"><Stepper value={pc.maxHp} min={1} onChange={(v) => set({ maxHp: v, currentHp: Math.min(pc.currentHp, v) })} /></Field>
        <Field label="AC"><Stepper value={pc.armorClass} min={1} onChange={(v) => set({ armorClass: v })} /></Field>
        <Field label="Gold"><Stepper value={pc.gold} min={0} bigStep={10} onChange={(v) => set({ gold: v })} /></Field>
        <Field label="XP"><Stepper value={pc.xp} min={0} step={10} bigStep={10} onChange={(v) => set({ xp: v })} /></Field>
      </div>
      <Field label="Spell slots (max per level)">
        <div className="row">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => {
            const slot = pc.spellSlots.find((s) => s.level === lvl);
            return (
              <span key={lvl} className="row" style={{ gap: 4 }}>
                <span className="muted">L{lvl}</span>
                <Stepper value={slot?.max ?? 0} min={0} max={4} onChange={(v) => set({ spellSlots: [...pc.spellSlots.filter((s) => s.level !== lvl), ...(v > 0 ? [{ level: lvl, max: v, used: Math.min(slot?.used ?? 0, v) }] : [])].sort((a, b) => a.level - b.level) })} />
              </span>
            );
          })}
        </div>
      </Field>
      <Field label="Resources (Rage, Ki, Channel Divinity…)">
        <div className="stack">
          {pc.resources.map((r, i) => (
            <div key={i} className="row between">
              <span>{r.name} ({r.recharge})</span>
              <span className="row">
                <Stepper value={r.max} min={0} onChange={(v) => set({ resources: pc.resources.map((x, j) => (j === i ? { ...x, max: v, used: Math.min(x.used, v) } : x)) })} />
                <Button small onClick={() => set({ resources: pc.resources.filter((_, j) => j !== i) })}>Remove</Button>
              </span>
            </div>
          ))}
          <div className="row">
            <input type="text" value={res} placeholder="Resource name" onChange={(e) => setRes(e.target.value)} style={{ flex: 1 }} />
            <Button onClick={() => { if (res.trim()) set({ resources: [...pc.resources, { name: res.trim(), max: 1, used: 0, recharge: "long-rest" }] }); setRes(""); }}>Add</Button>
          </div>
        </div>
      </Field>
      <Field label="Goals & arcs">
        <div className="stack">
          {pc.goals.map((g) => (
            <div key={g.id} className="row between">
              <span>{g.secret ? "🔒 " : ""}{g.text}</span>
              <span className="row">
                <Button small onClick={() => set({ goals: pc.goals.map((x) => (x.id === g.id ? { ...x, secret: !x.secret } : x)) })}>{g.secret ? "Secret" : "Open"}</Button>
                <Button small onClick={() => set({ goals: pc.goals.filter((x) => x.id !== g.id) })}>Remove</Button>
              </span>
            </div>
          ))}
          <div className="row">
            <input type="text" value={goal} placeholder="A goal, arc, or question" onChange={(e) => setGoal(e.target.value)} style={{ flex: 1 }} />
            <Button onClick={() => { if (goal.trim()) set({ goals: [...pc.goals, { id: newId("goal"), text: goal.trim(), status: "open", secret: false, relatedThreadIds: [] }] }); setGoal(""); }}>Add</Button>
          </div>
        </div>
      </Field>
      <Field label="Notes (DM only)"><TextArea value={pc.notes} onChange={(v) => set({ notes: v })} /></Field>
      <div className="row between">
        <Button variant="danger" onClick={onDelete}>Remove character</Button>
        <Button variant="primary" onClick={() => onSave(pc)}>Save</Button>
      </div>
    </div>
  );
}

function CanonSetup() {
  const { campaign, dispatch } = useCampaign();
  const [loc, setLoc] = useState<Location | null>(null);
  const [npc, setNpc] = useState<Npc | null>(null);
  const [thread, setThread] = useState<PlotThread | null>(null);
  const [fact, setFact] = useState<Fact | null>(null);
  const [faction, setFaction] = useState<Faction | null>(null);
  const blankLoc = (): Location => ({ id: newId("loc"), name: "New place", kind: "building", parentId: campaign.party.currentLocationId, description: "", secretNotes: "", hooks: [], tags: [], discoveredByParty: false, provisional: false });
  const blankNpc = (): Npc => ({ id: newId("npc"), name: "New NPC", role: "", locationId: campaign.party.currentLocationId, appearance: "", personality: "", mannerisms: [], voice: { pitch: "medium", pace: "measured", texture: "", accent: "", catchphrases: [], notes: "" }, motive: "", secretMotive: "", mood: "calm", relationshipToParty: 0, memories: [], status: "alive", assets: {}, secret: false, provisional: false, tags: [] });
  return (
    <div className="grid">
      <Card title={`Locations (${campaign.world.locations.length})`} right={<Button small onClick={() => setLoc(blankLoc())}>Add</Button>}>
        <ul className="list small">
          {campaign.world.locations.map((l) => (
            <li key={l.id} className="row between" onClick={() => setLoc(l)}>
              <span>{l.name} <span className="muted">{l.kind}{l.parentId ? ` in ${campaign.world.locations.find((p) => p.id === l.parentId)?.name ?? "?"}` : ""}</span></span>
              <span>{l.provisional && <Tag kind="warn">provisional</Tag>}{l.discoveredByParty ? <Tag kind="ok">known</Tag> : <Tag>hidden</Tag>}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`NPCs (${campaign.world.npcs.length})`} right={<Button small onClick={() => setNpc(blankNpc())}>Add</Button>}>
        <ul className="list small">
          {campaign.world.npcs.map((n) => (
            <li key={n.id} className="row between" onClick={() => setNpc(n)}>
              <span>{n.name} <span className="muted">{n.role}</span></span>
              <span>{n.secret && <Tag kind="secret">secret</Tag>}{n.status !== "alive" && <Tag kind="danger">{n.status}</Tag>}{n.provisional && <Tag kind="warn">provisional</Tag>}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`Factions (${campaign.world.factions.length})`} right={<Button small onClick={() => setFaction({ id: newId("fac"), name: "New faction", description: "", goals: [], reputation: 0, relationships: [], secret: false, tags: [] })}>Add</Button>}>
        <ul className="list small">
          {campaign.world.factions.map((f) => (
            <li key={f.id} className="row between" onClick={() => setFaction(f)}>
              <span>{f.name}</span>
              <span>{f.secret && <Tag kind="secret">secret</Tag>}<Tag kind={f.reputation < 0 ? "danger" : "ok"}>rep {f.reputation}</Tag></span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`Plot threads (${campaign.world.plotThreads.length})`} right={<Button small onClick={() => setThread({ id: newId("thr"), title: "New thread", summary: "", status: "active", hooks: [], involvedNpcIds: [], involvedFactionIds: [], involvedPcIds: [], secret: true, tags: [] })}>Add</Button>}>
        <ul className="list small">
          {campaign.world.plotThreads.map((t) => (
            <li key={t.id} className="row between" onClick={() => setThread(t)}>
              <span>{t.title}</span>
              <span>{t.secret && <Tag kind="secret">secret</Tag>}<Tag kind={t.status === "active" ? "ok" : ""}>{t.status}</Tag></span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={`Facts (${campaign.world.facts.length})`} right={<Button small onClick={() => setFact({ id: newId("fact"), statement: "", secret: true, relatedNpcIds: [], relatedLocationIds: [], relatedThreadIds: [], tags: [] })}>Add</Button>}>
        <p className="muted small">Objective truth. Reveal facts to the party or a single PC from the Live › Quick edit screen.</p>
        <ul className="list small">
          {campaign.world.facts.map((f) => (
            <li key={f.id} className="row between" onClick={() => setFact(f)}>
              <span>{f.statement}</span>
              <span>{f.secret ? (campaign.knowledge.partyKnown.includes(f.id) ? <Tag kind="ok">party knows</Tag> : <Tag kind="secret">backstage</Tag>) : <Tag kind="ok">public</Tag>}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={!!loc} onClose={() => setLoc(null)} title="Location">
        {loc && <LocationEditor value={loc} onSave={(l) => { dispatch({ type: "upsertLocation", location: l }); setLoc(null); }} onDelete={() => { dispatch({ type: "removeLocation", locationId: loc.id }); setLoc(null); }} />}
      </Modal>
      <Modal open={!!npc} onClose={() => setNpc(null)} title="NPC">
        {npc && <NpcEditor value={npc} onSave={(n) => { dispatch({ type: "upsertNpc", npc: n }); setNpc(null); }} onDelete={() => { dispatch({ type: "removeNpc", npcId: npc.id }); setNpc(null); }} />}
      </Modal>
      <Modal open={!!faction} onClose={() => setFaction(null)} title="Faction">
        {faction && (
          <div className="stack">
            <Field label="Name"><TextInput value={faction.name} onChange={(v) => setFaction({ ...faction, name: v })} /></Field>
            <Field label="Description"><TextArea value={faction.description} onChange={(v) => setFaction({ ...faction, description: v })} /></Field>
            <Field label="Reputation toward party (-100..100)"><Stepper value={faction.reputation} min={-100} max={100} bigStep={5} onChange={(v) => setFaction({ ...faction, reputation: v })} /></Field>
            <div className="row between">
              <Button onClick={() => setFaction({ ...faction, secret: !faction.secret })}>{faction.secret ? "Secret faction" : "Known faction"}</Button>
              <Button variant="primary" onClick={() => { dispatch({ type: "upsertFaction", faction }); setFaction(null); }}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!thread} onClose={() => setThread(null)} title="Plot thread">
        {thread && (
          <div className="stack">
            <Field label="Title"><TextInput value={thread.title} onChange={(v) => setThread({ ...thread, title: v })} /></Field>
            <Field label="Summary (DM only)"><TextArea value={thread.summary} onChange={(v) => setThread({ ...thread, summary: v })} /></Field>
            <Field label="Status"><Pills options={[{ value: "active", label: "Active" }, { value: "dormant", label: "Dormant" }, { value: "resolved", label: "Resolved" }]} value={thread.status} onChange={(v) => setThread({ ...thread, status: v })} /></Field>
            <Field label="Involved NPCs">
              <div className="pill-row">{campaign.world.npcs.map((n) => <button key={n.id} type="button" className={thread.involvedNpcIds.includes(n.id) ? "active" : ""} onClick={() => setThread({ ...thread, involvedNpcIds: thread.involvedNpcIds.includes(n.id) ? thread.involvedNpcIds.filter((x) => x !== n.id) : [...thread.involvedNpcIds, n.id] })}>{n.name}</button>)}</div>
            </Field>
            <div className="row between">
              <Button onClick={() => setThread({ ...thread, secret: !thread.secret })}>{thread.secret ? "Secret thread" : "Party-known thread"}</Button>
              <Button variant="primary" onClick={() => { dispatch({ type: "upsertPlotThread", thread }); setThread(null); }}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal open={!!fact} onClose={() => setFact(null)} title="Fact">
        {fact && (
          <div className="stack">
            <Field label="Statement"><TextArea value={fact.statement} onChange={(v) => setFact({ ...fact, statement: v })} /></Field>
            <Field label="Related NPCs">
              <div className="pill-row">{campaign.world.npcs.map((n) => <button key={n.id} type="button" className={fact.relatedNpcIds.includes(n.id) ? "active" : ""} onClick={() => setFact({ ...fact, relatedNpcIds: fact.relatedNpcIds.includes(n.id) ? fact.relatedNpcIds.filter((x) => x !== n.id) : [...fact.relatedNpcIds, n.id] })}>{n.name}</button>)}</div>
            </Field>
            <div className="row between">
              <Button onClick={() => setFact({ ...fact, secret: !fact.secret })}>{fact.secret ? "Secret (backstage)" : "Public"}</Button>
              <Button variant="primary" disabled={!fact.statement.trim()} onClick={() => { dispatch({ type: "upsertFact", fact }); setFact(null); }}>Save</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function LocationEditor({ value, onSave, onDelete }: { value: Location; onSave: (l: Location) => void; onDelete?: () => void }) {
  const { campaign } = useCampaign();
  const [l, setL] = useState(value);
  return (
    <div className="stack">
      <Field label="Name"><TextInput value={l.name} onChange={(v) => setL({ ...l, name: v })} /></Field>
      <Field label="Kind">
        <Pills options={(["region", "city", "town", "village", "district", "building", "room", "wilderness", "dungeon", "landmark"] as const).map((k) => ({ value: k, label: k }))} value={l.kind} onChange={(v) => setL({ ...l, kind: v })} />
      </Field>
      <Field label="Inside">
        <select value={l.parentId ?? ""} onChange={(e) => setL({ ...l, parentId: e.target.value || undefined })}>
          <option value="">(top level)</option>
          {campaign.world.locations.filter((x) => x.id !== l.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      {["city", "town", "village"].includes(l.kind) && (
        <Field label="Settlement size (drives shop inventories)">
          <Pills options={(["hamlet", "village", "town", "city", "metropolis"] as const).map((s) => ({ value: s, label: s }))} value={l.settlementSize ?? "town"} onChange={(v) => setL({ ...l, settlementSize: v })} />
        </Field>
      )}
      <Field label="Description (may be read aloud)"><TextArea value={l.description} onChange={(v) => setL({ ...l, description: v })} /></Field>
      <Field label="Secret notes (DM only)"><TextArea value={l.secretNotes} onChange={(v) => setL({ ...l, secretNotes: v })} /></Field>
      <Field label="Hooks (one per line)"><TextArea value={l.hooks.join("\n")} onChange={(v) => setL({ ...l, hooks: v.split("\n").map((s) => s.trim()).filter(Boolean) })} /></Field>
      <div className="row between">
        <span className="row">
          <Button onClick={() => setL({ ...l, discoveredByParty: !l.discoveredByParty })}>{l.discoveredByParty ? "Party knows it" : "Hidden from party"}</Button>
          {onDelete && <Button variant="danger" onClick={onDelete}>Delete</Button>}
        </span>
        <Button variant="primary" onClick={() => onSave({ ...l, provisional: false })}>Save{l.provisional ? " & approve" : ""}</Button>
      </div>
    </div>
  );
}

export function NpcEditor({ value, onSave, onDelete }: { value: Npc; onSave: (n: Npc) => void; onDelete?: () => void }) {
  const { campaign } = useCampaign();
  const [n, setN] = useState(value);
  return (
    <div className="stack">
      <div className="grid">
        <Field label="Name"><TextInput value={n.name} onChange={(v) => setN({ ...n, name: v })} /></Field>
        <Field label="Role"><TextInput value={n.role} onChange={(v) => setN({ ...n, role: v })} /></Field>
      </div>
      <Field label="Location">
        <select value={n.locationId ?? ""} onChange={(e) => setN({ ...n, locationId: e.target.value || undefined })}>
          <option value="">(nowhere in particular)</option>
          {campaign.world.locations.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Faction">
        <select value={n.factionId ?? ""} onChange={(e) => setN({ ...n, factionId: e.target.value || undefined })}>
          <option value="">(none)</option>
          {campaign.world.factions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <Field label="Appearance"><TextArea value={n.appearance} onChange={(v) => setN({ ...n, appearance: v })} rows={2} /></Field>
      <Field label="Personality"><TextArea value={n.personality} onChange={(v) => setN({ ...n, personality: v })} rows={2} /></Field>
      <Field label="Mannerisms (one per line)"><TextArea value={n.mannerisms.join("\n")} onChange={(v) => setN({ ...n, mannerisms: v.split("\n").map((s) => s.trim()).filter(Boolean) })} rows={2} /></Field>
      <Field label="Open motive"><TextInput value={n.motive} onChange={(v) => setN({ ...n, motive: v })} /></Field>
      <Field label="Secret motive (DM only)"><TextInput value={n.secretMotive} onChange={(v) => setN({ ...n, secretMotive: v })} /></Field>
      <Field label="Voice">
        <div className="row">
          <Pills options={(["very-low", "low", "medium", "high", "very-high"] as const).map((p) => ({ value: p, label: p }))} value={n.voice.pitch} onChange={(v) => setN({ ...n, voice: { ...n.voice, pitch: v } })} />
          <Pills options={(["slow", "measured", "brisk", "rapid"] as const).map((p) => ({ value: p, label: p }))} value={n.voice.pace} onChange={(v) => setN({ ...n, voice: { ...n.voice, pace: v } })} />
        </div>
        <div className="grid" style={{ marginTop: 8 }}>
          <TextInput value={n.voice.texture} onChange={(v) => setN({ ...n, voice: { ...n.voice, texture: v } })} placeholder="texture: smoky, reedy, booming" />
          <TextInput value={n.voice.accent} onChange={(v) => setN({ ...n, voice: { ...n.voice, accent: v } })} placeholder="accent" />
          <TextInput value={n.voice.catchphrases.join(" | ")} onChange={(v) => setN({ ...n, voice: { ...n.voice, catchphrases: v.split("|").map((s) => s.trim()).filter(Boolean) } })} placeholder="catchphrases, separated by |" />
        </div>
      </Field>
      <Field label="Mood">
        <Pills options={(["calm", "warm", "wary", "hostile", "afraid", "grieving", "elated", "scheming", "bored", "desperate"] as const).map((m) => ({ value: m, label: m }))} value={n.mood} onChange={(v) => setN({ ...n, mood: v })} />
      </Field>
      <Field label="Status">
        <Pills options={(["alive", "dead", "missing", "unknown"] as const).map((s) => ({ value: s, label: s }))} value={n.status} onChange={(v) => setN({ ...n, status: v })} />
      </Field>
      <Field label="Relationship to party (-100..100)"><Stepper value={n.relationshipToParty} min={-100} max={100} bigStep={5} onChange={(v) => setN({ ...n, relationshipToParty: v })} /></Field>
      <Field label="Stat block (for NPCs who might fight)">
        <select value={n.statBlockId ?? ""} onChange={(e) => setN({ ...n, statBlockId: e.target.value || undefined })}>
          <option value="">(none)</option>
          {useCampaign().rules.monsters.map((m) => <option key={m.id} value={m.id}>{m.name} (CR {m.cr})</option>)}
        </select>
      </Field>
      <div className="row between">
        <span className="row">
          <Button onClick={() => setN({ ...n, secret: !n.secret })}>{n.secret ? "Secret NPC" : "Party may meet"}</Button>
          {onDelete && <Button variant="danger" onClick={onDelete}>Delete</Button>}
        </span>
        <Button variant="primary" onClick={() => onSave({ ...n, provisional: false })}>Save{n.provisional ? " & approve" : ""}</Button>
      </div>
    </div>
  );
}
