import React, { useEffect, useRef, useState } from "react";
import { useStore } from "./state/store.js";
import { HomeScreen } from "./screens/Home.js";
import { SetupScreen } from "./screens/Setup.js";
import { PrepScreen } from "./screens/Prep.js";
import { LiveScreen } from "./screens/Live.js";
import { RecapScreen } from "./screens/Recap.js";
import { InspectorScreen } from "./screens/Inspector.js";
import { SettingsScreen } from "./screens/Settings.js";

type Tab = "home" | "setup" | "prep" | "live" | "recap" | "inspector" | "settings";

export function App() {
  const store = useStore();
  const [tab, setTab] = useState<Tab>("home");
  const taps = useRef<number[]>([]);
  const hasCampaign = !!store.campaign;

  useEffect(() => {
    if (!hasCampaign && tab !== "home" && tab !== "settings") setTab("home");
  }, [hasCampaign, tab]);

  // Hidden inspector: tap the title five times quickly.
  const onTitleTap = () => {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2000), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setTab("inspector");
    }
  };

  const tabs: { id: Tab; label: string; needsCampaign: boolean }[] = [
    { id: "home", label: "Campaigns", needsCampaign: false },
    { id: "setup", label: "Setup", needsCampaign: true },
    { id: "prep", label: "Prep", needsCampaign: true },
    { id: "live", label: "Live", needsCampaign: true },
    { id: "recap", label: "Recap", needsCampaign: true },
    { id: "settings", label: "Settings", needsCampaign: false },
  ];

  return (
    <div className="app">
      <header className="topbar">
        <h1 onClick={onTitleTap}>Cardinal{store.campaign ? ` · ${store.campaign.name}` : ""}</h1>
        <span className="status">
          {store.online ? "online" : "OFFLINE"} · {store.aiReason} · {store.saving ? "saving…" : store.dirty ? "unsaved" : store.lastSavedAt ? "saved" : ""}
        </span>
        {store.canUndo && (
          <button className="btn small" onClick={store.undo} type="button">
            Undo
          </button>
        )}
      </header>
      {store.lastError && <div className="banner danger">{store.lastError}</div>}
      {!store.online && <div className="banner">Offline: AI features use built-in mock content until the connection returns. Everything else works.</div>}
      <main className="main">
        {tab === "home" && <HomeScreen onOpened={(c) => setTab(c.party.members.length ? "prep" : "setup")} />}
        {tab === "setup" && hasCampaign && <SetupScreen />}
        {tab === "prep" && hasCampaign && <PrepScreen goLive={() => setTab("live")} />}
        {tab === "live" && hasCampaign && <LiveScreen />}
        {tab === "recap" && hasCampaign && <RecapScreen />}
        {tab === "inspector" && hasCampaign && <InspectorScreen />}
        {tab === "settings" && <SettingsScreen />}
      </main>
      <nav className="tabbar">
        {tabs.map((t) => (
          <button key={t.id} className={tab === t.id ? "active" : ""} disabled={t.needsCampaign && !hasCampaign} onClick={() => setTab(t.id)} type="button">
            {t.label}
          </button>
        ))}
      </nav>
      <div style={{ position: "fixed", bottom: 80, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }}>
        {store.toasts.map((t) => (
          <div key={t.id} className={`banner ${t.kind === "danger" ? "danger" : ""}`} style={{ borderRadius: 12, pointerEvents: "auto", maxWidth: 600 }} onClick={() => store.dismissToast(t.id)}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
