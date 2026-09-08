import React, { useEffect, useRef, useState } from "react";
import { createCampaign, type Campaign } from "@cardinal/core";
import { Button, Card, Field, TextInput } from "../components/ui.js";
import { deleteCampaign, exportCampaignJson, importCampaignJson, listCampaigns, listSnapshots, loadCampaign, loadSnapshot } from "../persistence/db.js";
import { createSampleCampaign } from "../services/sample.js";
import { useStore } from "../state/store.js";

export function HomeScreen({ onOpened }: { onOpened: (campaign: Campaign) => void }) {
  const store = useStore();
  const [rows, setRows] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [name, setName] = useState("");
  const [snapshots, setSnapshots] = useState<{ id: number; at: string; label: string; schemaVersion: number }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => listCampaigns().then(setRows).catch((e: unknown) => store.toast(String(e), "danger"));
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (store.campaign) listSnapshots(store.campaign.id).then(setSnapshots).catch(() => setSnapshots([]));
  }, [store.campaign?.id, store.lastSavedAt]);

  const open = async (id: string) => {
    const r = await loadCampaign(id);
    if (!r) return store.toast("Campaign not found", "danger");
    store.setCampaign(r.campaign);
    if (r.migrated.length) store.toast(`Save file migrated: ${r.migrated.join(" ")}`, "warn");
    onOpened(r.campaign);
  };
  const create = () => {
    const c = createCampaign({ name: name.trim() || "Untitled campaign" });
    store.setCampaign(c, { snapshotLabel: "created" });
    setName("");
    onOpened(c);
  };
  const sample = () => {
    const c = createSampleCampaign();
    store.setCampaign(c, { snapshotLabel: "sample" });
    onOpened(c);
  };
  const exportJson = () => {
    if (!store.campaign) return;
    const blob = new Blob([exportCampaignJson(store.campaign)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${store.campaign.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-v${store.campaign.schemaVersion}.cardinal.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importFile = async (f: File) => {
    const r = importCampaignJson(await f.text());
    if (!r.ok) return store.toast(`Import failed: ${r.error}`, "danger");
    store.setCampaign(r.campaign, { snapshotLabel: "imported" });
    if (r.migrated.length) store.toast(`Migrated: ${r.migrated.join(" ")}`, "warn");
    await refresh();
    onOpened(r.campaign);
  };

  return (
    <div className="grid">
      <Card title="Your campaigns">
        {rows.length === 0 && <p className="muted">No campaigns yet. Create one or load the sample.</p>}
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="row between">
              <span>
                <strong>{r.name}</strong>
                <br />
                <span className="muted">updated {new Date(r.updatedAt).toLocaleString()}</span>
              </span>
              <span className="row">
                <Button variant="primary" onClick={() => void open(r.id)}>
                  Open
                </Button>
                <Button
                  variant="danger"
                  small
                  onClick={() => {
                    if (confirm(`Delete "${r.name}" and its snapshots? This cannot be undone.`)) {
                      void deleteCampaign(r.id).then(() => {
                        if (store.campaign?.id === r.id) store.setCampaign(null);
                        void refresh();
                      });
                    }
                  }}
                >
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="New campaign">
        <Field label="Name">
          <TextInput value={name} onChange={setName} placeholder="The Greywater Chronicles" />
        </Field>
        <div className="row">
          <Button variant="primary" onClick={create}>
            Create
          </Button>
          <Button onClick={sample}>Load sample campaign</Button>
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>
          Everything stays on this device. Use export to back up between sessions.
        </p>
      </Card>
      <Card title="Backup & restore">
        <div className="row">
          <Button onClick={exportJson} disabled={!store.campaign}>
            Export current as JSON
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
        </div>
        {store.campaign && (
          <>
            <h3 style={{ marginTop: 16 }}>Snapshots of “{store.campaign.name}”</h3>
            <ul className="list small">
              {snapshots.slice(0, 12).map((s) => (
                <li key={s.id} className="row between">
                  <span>
                    {new Date(s.at).toLocaleString()} · {s.label} · v{s.schemaVersion}
                  </span>
                  <Button
                    small
                    onClick={() => {
                      if (confirm("Restore this snapshot? Current state will be snapshotted first.")) {
                        void loadSnapshot(s.id).then((c) => c && store.setCampaign(c, { snapshotLabel: "restored" }));
                      }
                    }}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
