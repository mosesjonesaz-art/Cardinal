/** Live-table console: navigation, NPC cards, shops, combat, rules lookup, quick edits. Touch only. */
import React, { useState } from "react";
import { latestSession } from "@cardinal/core";
import { Pills } from "../components/ui.js";
import { useCampaign } from "../state/store.js";
import { NavigateView } from "./live/Navigate.js";
import { NpcsView } from "./live/Npcs.js";
import { ShopView } from "./live/Shop.js";
import { CombatView } from "./live/Combat.js";
import { LookupView } from "./live/Lookup.js";
import { QuickEditView } from "./live/QuickEdit.js";

export type LiveTab = "navigate" | "npcs" | "shop" | "combat" | "lookup" | "quick";

export function LiveScreen() {
  const { campaign, dispatch, combat } = useCampaign();
  const [tab, setTab] = useState<LiveTab>("navigate");
  const session = latestSession(campaign);
  const liveSession = session && session.status !== "complete" ? session : undefined;
  return (
    <div className="stack">
      <div className="row between">
        <Pills
          options={[
            { value: "navigate", label: "Navigate" },
            { value: "npcs", label: "NPCs" },
            { value: "shop", label: "Shop" },
            { value: "combat", label: combat ? `Combat · R${combat.round}` : "Combat" },
            { value: "lookup", label: "Lookup" },
            { value: "quick", label: "Quick edit" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <span className="muted small">
          {liveSession ? `Session ${liveSession.number} (${liveSession.status})` : "No open session"}{" "}
          {!liveSession && (
            <button className="btn small" type="button" onClick={() => dispatch({ type: "createSession" })}>
              Start session
            </button>
          )}
          {liveSession?.status === "planned" && (
            <button className="btn small" type="button" onClick={() => dispatch({ type: "setSessionStatus", sessionId: liveSession.id, status: "live" })}>
              Mark live
            </button>
          )}
        </span>
      </div>
      {tab === "navigate" && <NavigateView sessionId={liveSession?.id} goTo={setTab} />}
      {tab === "npcs" && <NpcsView sessionId={liveSession?.id} />}
      {tab === "shop" && <ShopView sessionId={liveSession?.id} />}
      {tab === "combat" && <CombatView sessionId={liveSession?.id} />}
      {tab === "lookup" && <LookupView />}
      {tab === "quick" && <QuickEditView sessionId={liveSession?.id} />}
    </div>
  );
}
