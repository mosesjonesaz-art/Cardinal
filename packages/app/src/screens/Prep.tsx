/** Pre-session prep: brief, encounter proposals against current resources, balance flags, bonus views. */
import React, { useState } from "react";
import { buildFactionMap, buildLootLog, buildSessionBriefData, buildTimeline, isFeatureEnabled, readCampaignEncounter, renderBriefText, type Encounter } from "@cardinal/core";
import { briefGenerator, encounterGenerator, readProposal, type EncounterProposal, type GenerationResult, type SessionBrief } from "@cardinal/ai";
import { Button, Card, Field, Issues, Pills, SourceTag, Spinner, Tag, TextInput } from "../components/ui.js";
import { useCampaign } from "../state/store.js";

export function PrepScreen({ goLive }: { goLive: () => void }) {
  const { campaign, rules, ai, dispatch, settings, toast } = useCampaign();
  const [brief, setBrief] = useState<GenerationResult<SessionBrief> | null>(null);
  const [busy, setBusy] = useState(false);
  const [difficulty, setDifficulty] = useState<"low" | "moderate" | "high">("moderate");
  const [theme, setTheme] = useState("");
  const [proposal, setProposal] = useState<GenerationResult<EncounterProposal> | null>(null);
  const data = buildSessionBriefData(campaign, rules);

  const generateBrief = async () => {
    setBusy(true);
    setBrief(await ai.run(briefGenerator, { campaign, rules }, { timeoutMs: settings.prepTimeoutMs }));
    setBusy(false);
  };
  const propose = async () => {
    setBusy(true);
    setProposal(await ai.run(encounterGenerator, { campaign, rules, difficulty, locationId: campaign.party.currentLocationId, theme: theme || undefined, seed: `${Date.now()}` }, { timeoutMs: settings.prepTimeoutMs }));
    setBusy(false);
  };
  const keepProposal = () => {
    if (!proposal) return;
    const e: Encounter = { id: `enc_${Date.now().toString(36)}`, name: proposal.output.name, locationId: campaign.party.currentLocationId, monsters: proposal.output.monsters, notes: `${proposal.output.tactics}\n\nTwist: ${proposal.output.twist}`, narrative: proposal.output.narrative, status: "planned", tags: ["ai-proposed"] };
    dispatch({ type: "upsertEncounter", encounter: e }, { snapshotLabel: "encounter added" });
    toast(`Added "${e.name}" to planned encounters`);
    setProposal(null);
  };
  const startSession = () => {
    dispatch({ type: "createSession" }, { snapshotLabel: "session created" });
    toast(`Session ${data.nextSessionNumber} created. Go Live when the table is ready.`);
  };

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <Button variant="primary" onClick={() => void generateBrief()} disabled={busy}>
            {busy ? "Working…" : "Generate session brief"}
          </Button>
          <Button onClick={startSession}>Create session {data.nextSessionNumber}</Button>
          <Button onClick={goLive}>Go Live →</Button>
        </div>
        {data.pendingLevelUps.length > 0 && <Tag kind="warn">Level-ups pending: {data.pendingLevelUps.map((l) => `${l.name} ${l.from}→${l.to}`).join(", ")}</Tag>}
      </div>
      <div className="grid wide">
        <Card title="Session brief" right={brief && <SourceTag source={brief.source} issues={brief.issues} />}>
          {!brief && !busy && <pre className="raw" style={{ maxHeight: 400 }}>{renderBriefText(data)}</pre>}
          {busy && !brief && <Spinner label="Writing the brief…" />}
          {brief && <BriefView brief={brief.output} />}
          {brief && <Issues issues={brief.issues} />}
        </Card>
        <Card title="Per-PC debrief & spotlight">
          <ul className="list">
            {data.pcDebriefs.map((p) => (
              <li key={p.pcId}>
                <strong>{p.name}</strong> <span className="muted">L{p.level} · HP {p.hp}</span>{" "}
                {p.spotlight.deficit > 0.05 ? <Tag kind="warn">spotlight owed</Tag> : p.spotlight.deficit < -0.05 ? <Tag>recently heavy</Tag> : <Tag kind="ok">balanced</Tag>}
                <div className="small">{p.openGoals.length ? p.openGoals.join("; ") : <span className="muted">no open goals</span>}</div>
                <div className="muted small">{p.privateSecretsCount} private secret(s) · avg share {Math.round(p.spotlight.average * 100)}% · {p.spotlight.sessionsSinceFocus} session(s) since focus</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Consequences to resurface">
          {data.dueConsequences.length === 0 && <p className="muted">Nothing pending.</p>}
          <ul className="list small">
            {data.dueConsequences.map((c) => (
              <li key={c.id} className="row between">
                <span><Tag kind={c.severity === "major" ? "danger" : c.severity === "moderate" ? "warn" : ""}>{c.severity}</Tag>{c.description}</span>
                <Button small onClick={() => dispatch({ type: "setConsequenceStatus", consequenceId: c.id, status: "resolved" })}>Resolve</Button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Planned encounters vs current resources">
          <p className="muted small">Party strength ×{readCampaignEncounter(rules, campaign.party, { id: "x", name: "x", monsters: [], notes: "", narrative: "", status: "planned", tags: [] }, []).strength.factor.toFixed(2)} of full rest.</p>
          {data.plannedEncounters.length === 0 && <p className="muted">No planned encounters.</p>}
          <ul className="list">
            {data.plannedEncounters.map(({ encounter, read }) => (
              <li key={encounter.id}>
                <div className="row between">
                  <strong>{encounter.name}</strong>
                  <span>
                    <Tag>{read.encounterXp} XP</Tag>
                    <Tag kind={read.difficultyAtFullRest === "deadly" ? "danger" : ""}>{read.difficultyAtFullRest} at full rest</Tag>
                    <Tag kind={read.difficultyNow === "deadly" ? "danger" : read.difficultyNow === "high" ? "warn" : read.difficultyNow === "trivial" ? "warn" : "ok"}>{read.difficultyNow} now</Tag>
                  </span>
                </div>
                <div className="muted small">{encounter.monsters.map((m) => `${m.count} × ${rules.monsters.find((s) => s.id === m.statBlockId)?.name ?? campaign.world.statBlocks.find((s) => s.id === m.statBlockId)?.name ?? m.statBlockId}`).join(", ")}</div>
                {read.flags.map((f, i) => <div key={i} className="small" style={{ color: "var(--warn)" }}>⚠ {f.message}</div>)}
                <details><summary className="muted small">Show the math</summary><pre className="raw">{[...read.explanation, ...read.strength.explanation].join("\n")}</pre></details>
                <div className="row" style={{ marginTop: 6 }}>
                  <Button small onClick={() => dispatch({ type: "setEncounterStatus", encounterId: encounter.id, status: "discarded" })}>Discard</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Propose an encounter (against current party state)">
          <Field label="Difficulty"><Pills options={[{ value: "low", label: "Low" }, { value: "moderate", label: "Moderate" }, { value: "high", label: "High" }]} value={difficulty} onChange={setDifficulty} /></Field>
          <Field label="Theme (optional)"><TextInput value={theme} onChange={setTheme} placeholder="cultists, wolves in the mist, a toll bridge…" /></Field>
          <Button variant="primary" onClick={() => void propose()} disabled={busy}>Propose</Button>
          {proposal && (
            <div className="stack" style={{ marginTop: 12 }}>
              <div className="row between"><strong>{proposal.output.name}</strong><SourceTag source={proposal.source} issues={proposal.issues} /></div>
              <ProposalRead proposal={proposal.output} difficulty={difficulty} />
              <p className="small">{proposal.output.narrative}</p>
              <p className="small"><strong>Tactics:</strong> {proposal.output.tactics}</p>
              <p className="small"><strong>Twist:</strong> {proposal.output.twist}</p>
              <Issues issues={proposal.issues} />
              <div className="row"><Button variant="primary" onClick={keepProposal}>Keep</Button><Button onClick={() => setProposal(null)}>Discard</Button></div>
            </div>
          )}
        </Card>
        {isFeatureEnabled(campaign, "timeline") && (
          <Card title="Timeline (bonus)">
            <ul className="list small">{buildTimeline(campaign, { includeSecret: true }).slice(-20).map((t, i) => <li key={i}>S{t.sessionNumber} · {t.secret && <Tag kind="secret">secret</Tag>}{t.text}</li>)}</ul>
          </Card>
        )}
        {isFeatureEnabled(campaign, "factionMap") && (
          <Card title="Faction map (bonus)">
            {buildFactionMap(campaign).nodes.map((n) => <div key={n.id} className="small">{n.secret && <Tag kind="secret">secret</Tag>}<strong>{n.name}</strong> rep {n.reputation}</div>)}
            <ul className="list small">{buildFactionMap(campaign).edges.map((e, i) => <li key={i}>{campaign.world.factions.find((f) => f.id === e.from)?.name} → {campaign.world.factions.find((f) => f.id === e.to)?.name}: {e.stance}{e.note && ` (${e.note})`}</li>)}</ul>
          </Card>
        )}
        {isFeatureEnabled(campaign, "lootLog") && (
          <Card title="Loot log (bonus)">
            {buildLootLog(campaign).length === 0 && <p className="muted">No transactions logged yet.</p>}
            <ul className="list small">{buildLootLog(campaign).map((l, i) => <li key={i}>S{l.sessionNumber} · {l.text}</li>)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function BriefView({ brief }: { brief: SessionBrief }) {
  const { campaign } = useCampaign();
  const name = (id: string) => campaign.party.members.find((m) => m.id === id)?.name ?? id;
  return (
    <div className="stack small">
      <h3>{brief.headline}</h3>
      <p>{brief.whereWeLeftOff}</p>
      {brief.threads.length > 0 && <div><strong>Threads</strong><ul className="list">{brief.threads.map((t, i) => <li key={i}><strong>{t.title}</strong>: {t.nextBeat}</li>)}</ul></div>}
      {brief.pcDebriefs.length > 0 && <div><strong>Per PC</strong><ul className="list">{brief.pcDebriefs.map((p, i) => <li key={i}><strong>{p.name}</strong>: {p.notes}</li>)}</ul></div>}
      {brief.spotlightPlan.length > 0 && <div><strong>Spotlight plan</strong><ul className="list">{brief.spotlightPlan.map((p, i) => <li key={i}><strong>{name(p.pcId)}</strong>: {p.how}</li>)}</ul></div>}
      {brief.consequencesToSurface.length > 0 && <div><strong>Consequences</strong><ul className="list">{brief.consequencesToSurface.map((c, i) => <li key={i}>{c}</li>)}</ul></div>}
      {brief.balanceWarnings.length > 0 && <div><strong>Balance</strong><ul className="list">{brief.balanceWarnings.map((c, i) => <li key={i}>⚠ {c}</li>)}</ul></div>}
      <p><strong>Opening scene:</strong> {brief.openingScene}</p>
    </div>
  );
}

function ProposalRead({ proposal, difficulty }: { proposal: EncounterProposal; difficulty: "low" | "moderate" | "high" }) {
  const { campaign, rules } = useCampaign();
  const { read, groups } = readProposal({ campaign, rules, difficulty }, proposal);
  return (
    <div className="small">
      {groups.map((g) => `${g.count} × ${g.statBlock.name} (CR ${g.statBlock.cr})`).join(", ")} · <Tag>{read.encounterXp} XP</Tag>
      <Tag kind={read.difficultyNow === "deadly" ? "danger" : "ok"}>{read.difficultyNow} now</Tag>
      <details><summary className="muted">Math</summary><pre className="raw">{read.explanation.join("\n")}</pre></details>
    </div>
  );
}
