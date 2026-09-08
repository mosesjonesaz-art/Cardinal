/** Rules & stat-block lookup without leaving the flow. */
import React, { useState } from "react";
import { xpForCr } from "@cardinal/core";
import { Card, Pills, TextInput } from "../../components/ui.js";
import { useCampaign } from "../../state/store.js";
import { StatBlockView } from "./Combat.js";

export function LookupView() {
  const { rules, campaign } = useCampaign();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"monsters" | "spells" | "conditions">("monsters");
  const needle = q.trim().toLowerCase();
  const monsters = [...campaign.world.statBlocks, ...rules.monsters].filter((m) => !needle || m.name.toLowerCase().includes(needle) || m.type.toLowerCase().includes(needle));
  const spells = rules.spells.filter((s) => !needle || s.name.toLowerCase().includes(needle));
  const conditions = rules.conditions.filter((c) => !needle || c.name.toLowerCase().includes(needle));
  return (
    <div className="stack">
      <div className="row">
        <div style={{ flex: 1 }}><TextInput value={q} onChange={setQ} placeholder="search…" /></div>
        <Pills options={[{ value: "monsters", label: `Monsters (${monsters.length})` }, { value: "spells", label: `Spells (${spells.length})` }, { value: "conditions", label: `Conditions (${conditions.length})` }]} value={kind} onChange={setKind} />
      </div>
      <div className="grid">
        {kind === "monsters" && monsters.slice(0, 30).map((m) => <Card key={m.id} title={`${m.name} · ${xpForCr(rules, m.cr)} XP`}><StatBlockView sb={m} /></Card>)}
        {kind === "spells" && spells.map((s) => <Card key={s.name} title={`${s.name} · level ${s.level}`}><div className="small muted">{s.school} · {s.castingTime} · {s.range} · {s.duration}</div><p className="small">{s.summary}</p></Card>)}
        {kind === "conditions" && conditions.map((c) => <Card key={c.name} title={c.name}><p className="small">{c.summary}</p></Card>)}
      </div>
      <p className="muted small">{rules.attribution}</p>
    </div>
  );
}
