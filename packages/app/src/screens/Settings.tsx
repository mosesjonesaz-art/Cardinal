import React from "react";
import { Button, Card, Field, Pills, TextInput } from "../components/ui.js";
import { useStore } from "../state/store.js";

export function SettingsScreen() {
  const { settings, updateSettings, aiReason, online } = useStore();
  return (
    <div className="grid">
      <Card title="AI provider">
        <p className="muted small">
          Active: {aiReason}. {online ? "" : "Currently offline."}
        </p>
        <Field label="Provider">
          <Pills
            options={[
              { value: "mock", label: "Built-in mock (offline, free)" },
              { value: "anthropic", label: "Anthropic (Claude)" },
            ]}
            value={settings.provider}
            onChange={(v) => updateSettings({ provider: v })}
          />
        </Field>
        {settings.provider === "anthropic" && (
          <>
            <Field label="API key (stored only on this device)">
              <TextInput type="password" value={settings.apiKey} onChange={(v) => updateSettings({ apiKey: v.trim() })} placeholder="sk-ant-…" />
            </Field>
            <Field label="Model">
              <Pills
                options={[
                  { value: "claude-opus-5", label: "Claude Opus 5 (default)" },
                  { value: "claude-sonnet-5", label: "Claude Sonnet 5 (faster)" },
                ]}
                value={settings.model}
                onChange={(v) => updateSettings({ model: v })}
              />
            </Field>
            <p className="muted small">
              The iPad calls the API directly with your key. For a shared or hosted deployment, put a proxy in front of it (see docs/ARCHITECTURE.md).
            </p>
          </>
        )}
        <Field label="Live-table timeout (seconds): after this, Cardinal shows fallback content instead of waiting">
          <Pills
            options={[
              { value: "10000", label: "10" },
              { value: "20000", label: "20" },
              { value: "40000", label: "40" },
            ]}
            value={String(settings.liveTimeoutMs)}
            onChange={(v) => updateSettings({ liveTimeoutMs: Number(v) })}
          />
        </Field>
      </Card>
      <Card title="About">
        <p className="small">
          Cardinal is a backstage-only assistant. Nothing here is ever shown to players; the DM is the only interface to the table. Tap the title five times to open the inspector.
        </p>
        <Button onClick={() => window.location.reload()}>Reload app</Button>
      </Card>
    </div>
  );
}
