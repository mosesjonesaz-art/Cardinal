/** Combat assistant: initiative, live difficulty read, tactics, and narrative difficulty levers (never auto-applied). */
import React, { useState } from "react";
import {
  addMonsterFromStatBlock, applyDamage, currentCombatant, findStatBlock, nextTurn, pcsInDangerFraction, readLiveCombat, removeCombatant,
  startCombat, suggestTactics, summarizeCombat, toggleCondition, type DifficultyLever, type Encounter, type MonsterGroup,
} from "@cardinal/core";
import { enrichLevers, leversGenerator, tacticsGenerator, type GenerationResult, type Tactics } from "@cardinal/ai";
import { Button, Card, Field, Issues, Modal, Pills, SourceTag, Spinner, Stepper, Tag } from "../../components/ui.js";
import { useCampaign } from "../../state/store.js";

const CONDITIONS = ["Prone", "Grappled", "Restrained", "Frightened", "Poisoned", "Blinded", "Paralyzed", "Stunned", "Unconscious", "Concentrating"];

export function CombatView({ sessionId }: { sessionId?: string }) {
  const { campaign, rules, combat, setCombat, ai, dispatch, toast } = useCampaign();
  const statBlocks = [...campaign.world.statBlocks, ...rules.monsters];
  const [encounterId, setEncounterId] = useState<string>(campaign.world.encounters.find((e) => e.status === "planned")?.id ?? "");
  const [inits, setInits] = useState<Record<string, number>>({});
  const [tactics, setTactics] = useState<GenerationResult<Tactics> | null>(null);
  const [levers, setLevers] = useState<{ levers: DifficultyLever[]; source: "llm" | "fallback"; issues: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [addId, setAddId] = useState<string>(rules.monsters[0]?.id ?? "");
  const [conditionFor, setConditionFor] = useState<string | null>(null);

  if (!combat) {
    const enc = campaign.world.encounters.find((e) => e.id === encounterId);
    const start = () => {
      const monsterInits: Record<string, number> = {};
      for (const m of enc?.monsters ?? []) monsterInits[m.statBlockId] = inits[m.statBlockId] ?? 10;
      const state = startCombat({ id: `cbt_${Date.now().toString(36)}`, encounter: enc, party: campaign.party, statBlocks, pcInitiatives: inits, monsterInitiatives: monsterInits });
      setCombat(state);
      if (enc) dispatch({ type: "setEncounterStatus", encounterId: enc.id, status: "running" });
      if (sessionId) dispatch({ type: "logEvent", sessionId, event: { kind: "combat", text: `Combat began: ${enc?.name ?? "improvised fight"}.`, pcIds: campaign.party.members.map((m) => m.id), locationId: campaign.party.currentLocationId } });
    };
    return (
      <Card title="Start combat">
        <Field label="Encounter">
          <select value={encounterId} onChange={(e) => setEncounterId(e.target.value)}>
            <option value="">(improvised: PCs only, add monsters as they appear)</option>
            {campaign.world.encounters.filter((e) => e.status === "planned" || e.status === "proposed").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
        <div className="grid">
          {campaign.party.members.map((pc) => (
            <div key={pc.id} className="row between"><span>{pc.name} initiative</span><Stepper value={inits[pc.id] ?? 10} min={-5} max={40} onChange={(v) => setInits({ ...inits, [pc.id]: v })} /></div>
          ))}
          {(enc?.monsters ?? []).map((m) => {
            const sb = statBlocks.find((s) => s.id === m.statBlockId);
            return <div key={m.statBlockId} className="row between"><span>{sb?.name ?? m.statBlockId} ×{m.count} initiative</span><Stepper value={inits[m.statBlockId] ?? 10} min={-5} max={40} onChange={(v) => setInits({ ...inits, [m.statBlockId]: v })} /></div>;
          })}
        </div>
        <Button variant="primary" onClick={start}>Roll in</Button>
      </Card>
    );
  }

  const read = readLiveCombat(rules, combat, campaign.party, campaign.world.statBlocks);
  const current = currentCombatant(combat);
  const groups: MonsterGroup[] = Object.values(
    combat.combatants.filter((c) => c.kind === "monster" && c.hp > 0).reduce<Record<string, MonsterGroup>>((acc, c) => {
      const sb = statBlocks.find((s) => s.id === c.refId);
      if (!sb) return acc;
      const g = acc[c.refId] ?? { statBlock: sb, count: 0 };
      acc[c.refId] = { ...g, count: g.count + 1 };
      return acc;
    }, {}),
  );

  const askTactics = async () => {
    setBusy(true);
    setTactics(await ai.run(tacticsGenerator, { campaign, combat, statBlocks, read }));
    setBusy(false);
  };
  const askLevers = async () => {
    setBusy(true);
    const input = { campaign, rules, read, groups, round: combat.round, pcsInDanger: pcsInDangerFraction(combat) };
    const r = await ai.run(leversGenerator, input);
    setLevers({ levers: enrichLevers(r.output, input), source: r.source, issues: r.issues });
    setBusy(false);
  };
  const applyLever = (l: DifficultyLever) => {
    // The DM approved it: log the change and its cost as ground truth; mechanical effect is applied by hand.
    if (sessionId) {
      dispatch({ type: "logEvent", sessionId, event: { kind: "combat", text: `DM applied lever "${l.title}": ${l.narrative}`, tags: ["lever", l.id] } });
      dispatch({ type: "addConsequence", consequence: { description: `Cost of "${l.title}": ${l.cost}`, sessionId, severity: "minor", tags: ["lever"] } });
    }
    if (l.id === "retreat") {
      const weakest = [...groups].sort((a, b) => a.statBlock.cr - b.statBlock.cr)[0];
      if (weakest) {
        let state = combat;
        for (const c of combat.combatants.filter((c) => c.kind === "monster" && c.refId === weakest.statBlock.id)) state = removeCombatant(state, c.id);
        setCombat(state);
      }
    }
    if (l.id === "reinforcements") {
      const strongest = [...groups].sort((a, b) => b.statBlock.cr - a.statBlock.cr)[0];
      if (strongest) setCombat(addMonsterFromStatBlock(combat, strongest.statBlock, 10));
    }
    toast(`Applied "${l.title}". Cost tagged as a consequence.`);
    setLevers(null);
  };
  const end = () => {
    const summary = summarizeCombat(rules, combat, campaign.world.statBlocks);
    for (const [pcId, hp] of Object.entries(summary.pcHp)) dispatch({ type: "setPcHp", pcId, value: hp, reason: "combat" });
    if (summary.xpAward > 0 && confirm(`Award ${summary.xpAward} XP (${summary.xpPerPc} each)?`)) dispatch({ type: "awardXp", amount: summary.xpAward });
    if (combat.encounterId) dispatch({ type: "setEncounterStatus", encounterId: combat.encounterId, status: "complete" });
    if (sessionId) dispatch({ type: "logEvent", sessionId, event: { kind: "combat", text: `Combat ended. Defeated: ${summary.defeated.map((d) => d.name).join(", ") || "none"}. Survivors: ${summary.survivors.map((s) => s.name).join(", ") || "none"}.`, pcIds: campaign.party.members.map((m) => m.id) } }, { snapshotLabel: "combat ended" });
    setCombat(null);
    setTactics(null);
    setLevers(null);
  };

  return (
    <div className="grid wide">
      <Card title={`Round ${combat.round} · ${current?.name ?? "—"}`} right={<span className="row"><Button onClick={() => setCombat(nextTurn(combat))} variant="primary">Next turn →</Button><Button variant="danger" small onClick={() => { if (confirm("End combat? PC HP is written back and XP offered.")) end(); }}>End</Button></span>}>
        <div className="stack">
          {combat.combatants.map((c) => (
            <div key={c.id} className={`combatant ${c.id === current?.id ? "current" : ""} ${c.hp <= 0 ? "dead" : ""}`}>
              <div className="init">{c.initiative}</div>
              <div>
                <div className="row between">
                  <strong>{c.name}</strong>
                  <span className="muted small">AC {c.armorClass}{c.conditions.length > 0 && ` · ${c.conditions.join(", ")}`}</span>
                </div>
                <div className={`hp-bar ${c.hp / c.maxHp <= 0.25 ? "low" : ""}`}><div style={{ width: `${Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))}%` }} /></div>
              </div>
              <div className="row">
                <Stepper value={c.hp} min={0} max={c.maxHp} bigStep={5} onChange={(v) => setCombat(applyDamage(combat, c.id, c.hp - v))} />
                <Button small onClick={() => setConditionFor(c.id)}>Cond.</Button>
                {c.kind === "monster" && <Button small onClick={() => setCombat(removeCombatant(combat, c.id))}>✕</Button>}
              </div>
            </div>
          ))}
          <div className="row">
            <select value={addId} onChange={(e) => setAddId(e.target.value)} style={{ maxWidth: 260 }}>{statBlocks.map((s) => <option key={s.id} value={s.id}>{s.name} (CR {s.cr})</option>)}</select>
            <Button onClick={() => { const sb = findStatBlock(campaign, rules, addId); if (sb) setCombat(addMonsterFromStatBlock(combat, sb, 10)); }}>Add to fight</Button>
          </div>
        </div>
      </Card>
      <div className="stack">
        <Card title="Difficulty right now">
          <div className="row">
            <Tag kind={read.difficultyNow === "deadly" ? "danger" : read.difficultyNow === "high" ? "warn" : read.difficultyNow === "trivial" ? "warn" : "ok"}>{read.difficultyNow.toUpperCase()}</Tag>
            <span className="small">{read.encounterXp} XP remaining vs L/M/H {read.budgetEffective.low}/{read.budgetEffective.moderate}/{read.budgetEffective.high} · party strength ×{read.strength.factor.toFixed(2)}</span>
          </div>
          {read.flags.map((f, i) => <div key={i} className="small" style={{ color: "var(--warn)" }}>⚠ {f.message}</div>)}
          <div className="row" style={{ marginTop: 8 }}>
            <Button onClick={() => void askTactics()} disabled={busy}>Enemy tactics</Button>
            <Button onClick={() => void askLevers()} disabled={busy} variant="primary">Difficulty levers</Button>
          </div>
          {busy && <Spinner />}
        </Card>
        {(tactics || !busy) && (
          <Card title="What the enemies do" right={tactics && <SourceTag source={tactics.source} issues={tactics.issues} />}>
            <ul className="list small">
              {(tactics?.output.suggestions ?? suggestTactics(combat, statBlocks)).map((s, i) => <li key={i}><strong>{combat.combatants.find((c) => c.id === s.combatantId)?.name ?? s.combatantId}:</strong> {s.text}</li>)}
            </ul>
            {current && current.kind === "monster" && (() => { const sb = statBlocks.find((s) => s.id === current.refId); return sb ? <details open><summary className="small">{sb.name} stat block</summary><StatBlockView sb={sb} /></details> : null; })()}
          </Card>
        )}
        {levers && (
          <Card title="Narrative difficulty levers (you approve each)" right={<SourceTag source={levers.source} issues={levers.issues} />}>
            {levers.levers.length === 0 && <p className="muted">The fight is on target; no lever proposed.</p>}
            <ul className="list">
              {levers.levers.map((l) => (
                <li key={l.id}>
                  <div className="row between"><strong>{l.title}</strong><Tag kind={l.direction === "easier" ? "ok" : "warn"}>{l.direction} · {l.xpDelta > 0 ? "+" : ""}{l.xpDelta} XP</Tag></div>
                  <div className="small">{l.narrative}</div>
                  <div className="small"><strong>Cost:</strong> {l.cost}</div>
                  <div className="small muted"><strong>Effect:</strong> {l.mechanicalEffect}</div>
                  <div className="row" style={{ marginTop: 6 }}><Button small variant="primary" onClick={() => applyLever(l)}>Approve</Button><Button small onClick={() => setLevers({ ...levers, levers: levers.levers.filter((x) => x.id !== l.id) })}>Reject</Button></div>
                </li>
              ))}
            </ul>
            <Issues issues={levers.issues} />
          </Card>
        )}
      </div>
      <Modal open={!!conditionFor} onClose={() => setConditionFor(null)} title="Conditions">
        {conditionFor && (
          <Pills options={CONDITIONS.map((c) => ({ value: c, label: c }))} value={""} onChange={(c) => setCombat(toggleCondition(combat, conditionFor, c))} />
        )}
        {conditionFor && <p className="muted small" style={{ marginTop: 8 }}>Active: {combat.combatants.find((c) => c.id === conditionFor)?.conditions.join(", ") || "none"}. Tap to toggle.</p>}
      </Modal>
    </div>
  );
}

export function StatBlockView({ sb }: { sb: Encounter extends never ? never : import("@cardinal/core").StatBlock }) {
  return (
    <div className="small">
      <div><strong>{sb.name}</strong> · CR {sb.cr} · AC {sb.armorClass} · HP {sb.hitPoints} · {sb.speed} · {sb.size} {sb.type}</div>
      {sb.abilities && <div className="muted">STR {sb.abilities.str} DEX {sb.abilities.dex} CON {sb.abilities.con} INT {sb.abilities.int} WIS {sb.abilities.wis} CHA {sb.abilities.cha}</div>}
      {sb.traits.map((t) => <div key={t.name}><em>{t.name}.</em> {t.text}</div>)}
      {sb.actions.map((t) => <div key={t.name}><strong>{t.name}.</strong> {t.text}</div>)}
      {sb.bonusActions.map((t) => <div key={t.name}><strong>{t.name} (bonus).</strong> {t.text}</div>)}
      {sb.reactions.map((t) => <div key={t.name}><strong>{t.name} (reaction).</strong> {t.text}</div>)}
      {sb.tactics && <div className="muted">Tactics: {sb.tactics}</div>}
    </div>
  );
}
