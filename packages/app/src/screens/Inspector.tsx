/** Hidden debug view: raw state, overrides, canon issues, and the last AI generations with their inputs. */
import React, { useEffect, useState } from "react";
import { checkCanon } from "@cardinal/core";
import type { GenerationLogEntry } from "@cardinal/ai";
import { Button, Card, Pills, Tag } from "../components/ui.js";
import { loadPersistedLog } from "../persistence/db.js";
import { useCampaign } from "../state/store.js";

export function InspectorScreen() {
  const { campaign, rules, ai, combat } = useCampaign();
  const [view, setView] = useState<"log" | "state" | "overrides" | "canon" | "combat">("log");
  const [entries, setEntries] = useState<GenerationLogEntry[]>(ai.log.list(50));
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (view === "log") {
      const mem = ai.log.list(50);
      if (mem.length) setEntries(mem);
      else void loadPersistedLog(50).then(setEntries);
    }
  }, [view, ai]);
  const issues = checkCanon(campaign, rules.monsters.map((m) => m.id));
  return (
    <div className="stack">
      <Pills
        options={[
          { value: "log", label: `AI log (${entries.length})` },
          { value: "state", label: "Raw state" },
          { value: "overrides", label: `Overrides (${campaign.overrides.length})` },
          { value: "canon", label: `Canon (${issues.length})` },
          { value: "combat", label: "Combat" },
        ]}
        value={view}
        onChange={setView}
      />
      {view === "log" && (
        <Card title="Last generations (newest first)" right={<Button small onClick={() => setEntries(ai.log.list(50))}>Refresh</Button>}>
          <ul className="list">
            {entries.map((e) => (
              <li key={e.id}>
                <div className="row between" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <span>
                    <strong>{e.generator}</strong> <span className="muted">{new Date(e.at).toLocaleTimeString()} · {e.provider} · {e.durationMs} ms</span>
                  </span>
                  <span>
                    <Tag kind={e.source === "llm" ? "ok" : "warn"}>{e.source}</Tag>
                    {e.issues.length > 0 && <Tag kind="warn">{e.issues.length} issue(s)</Tag>}
                  </span>
                </div>
                {open === e.id && (
                  <div className="stack" style={{ marginTop: 8 }}>
                    {e.error && <div className="banner danger">{e.error}</div>}
                    {e.issues.length > 0 && <pre className="raw">{e.issues.join("\n")}</pre>}
                    <details>
                      <summary>Input</summary>
                      <pre className="raw">{JSON.stringify(e.input, null, 2)}</pre>
                    </details>
                    <details>
                      <summary>Prompt</summary>
                      <pre className="raw">{e.prompt.system}\n\n---\n\n{e.prompt.user}</pre>
                    </details>
                    <details>
                      <summary>Raw output</summary>
                      <pre className="raw">{JSON.stringify(e.rawOutput, null, 2)}</pre>
                    </details>
                    <details open>
                      <summary>Validated output</summary>
                      <pre className="raw">{JSON.stringify(e.output, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {view === "state" && (
        <Card title={`Campaign state (schema v${campaign.schemaVersion})`}>
          <pre className="raw">{JSON.stringify(campaign, null, 2)}</pre>
        </Card>
      )}
      {view === "overrides" && (
        <Card title="Override history (ground truth changes)">
          <ul className="list small">
            {campaign.overrides
              .slice()
              .reverse()
              .map((o) => (
                <li key={o.id} className="diff">
                  <span className="mono">{o.path}</span>
                  <span>
                    {JSON.stringify(o.previous)} → <strong>{JSON.stringify(o.next)}</strong>
                  </span>
                  <span className="muted">
                    {new Date(o.at).toLocaleString()} {o.reason && `· ${o.reason}`}
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
      {view === "canon" && (
        <Card title="Canon consistency (structural checks)">
          {issues.length === 0 && <p className="muted">No issues.</p>}
          <ul className="list small">
            {issues.map((i, n) => (
              <li key={n}>
                <Tag kind={i.severity === "error" ? "danger" : i.severity === "warning" ? "warn" : ""}>{i.code}</Tag> {i.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {view === "combat" && (
        <Card title="Combat state">
          <pre className="raw">{combat ? JSON.stringify(combat, null, 2) : "No combat running."}</pre>
        </Card>
      )}
    </div>
  );
}
