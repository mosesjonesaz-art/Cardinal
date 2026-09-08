/**
 * Single app store: campaign + reducer dispatch with autosave, undo, combat
 * state, generation service, asset service, settings, and online status.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { reduceCampaign, type Campaign, type CampaignAction, type CombatState, type RulesetConfig } from "@cardinal/core";
import { rules5e2024 } from "@cardinal/rules-5e-2024";
import type { GenerationService, NpcAssetService } from "@cardinal/ai";
import { saveCampaign, saveSnapshot } from "../persistence/db.js";
import { makeAssetService, makeGenerationService } from "../services/ai.js";
import { loadSettings, saveSettings, type AppSettings } from "../services/settings.js";

export interface Toast {
  id: number;
  text: string;
  kind: "info" | "warn" | "danger";
}

export interface AppStore {
  campaign: Campaign | null;
  rules: RulesetConfig;
  setCampaign: (c: Campaign | null, opts?: { snapshotLabel?: string }) => void;
  dispatch: (action: CampaignAction, opts?: { snapshotLabel?: string }) => void;
  undo: () => void;
  canUndo: boolean;
  combat: CombatState | null;
  setCombat: (c: CombatState | null) => void;
  ai: GenerationService;
  aiReason: string;
  assets: NpcAssetService;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  online: boolean;
  saving: boolean;
  /** True while changes are waiting to be written. */
  dirty: boolean;
  lastSavedAt: string | null;
  lastError: string | null;
  toasts: Toast[];
  toast: (text: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [campaign, setCampaignState] = useState<Campaign | null>(null);
  const [history, setHistory] = useState<Campaign[]>([]);
  const [combat, setCombat] = useState<CombatState | null>(null);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const pending = useRef<{ campaign: Campaign; snapshotLabel?: string; since: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const aiBundle = useMemo(() => makeGenerationService(settings, online), [settings, online]);
  const assets = useMemo(() => makeAssetService(), []);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "info" ? 3500 : 7000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p) return Promise.resolve();
    pending.current = null;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = null;
    setSaving(true);
    return saveCampaign(p.campaign)
      .then(() => (p.snapshotLabel ? saveSnapshot(p.campaign, p.snapshotLabel) : undefined))
      .then(() => {
        setLastSavedAt(new Date().toISOString());
        setLastError(null);
        if (!pending.current) setDirty(false);
      })
      .catch((e: unknown) => setLastError(e instanceof Error ? e.message : String(e)))
      .finally(() => setSaving(false));
  }, []);

  // Debounced autosave (400 ms idle, at most 1.5 s after the first pending change so a burst of
  // taps can never defer the save indefinitely); flushed immediately when the page is hidden or
  // unloaded, because iPadOS suspends PWAs without warning.
  const persist = useCallback(
    (c: Campaign, snapshotLabel?: string) => {
      // Two different labelled snapshots in one burst: write the first before coalescing.
      if (snapshotLabel && pending.current?.snapshotLabel && pending.current.snapshotLabel !== snapshotLabel) void flush();
      const since = pending.current?.since ?? Date.now();
      pending.current = { campaign: c, snapshotLabel: snapshotLabel ?? pending.current?.snapshotLabel, since };
      setDirty(true);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      const wait = Math.max(0, Math.min(400, since + 1500 - Date.now()));
      saveTimer.current = window.setTimeout(() => void flush(), wait);
    },
    [flush],
  );

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onPageHide = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flush]);

  const setCampaign = useCallback(
    (c: Campaign | null, opts?: { snapshotLabel?: string }) => {
      setCampaignState(c);
      setHistory([]);
      setCombat(null);
      if (c) persist(c, opts?.snapshotLabel ?? "opened");
    },
    [persist],
  );

  const dispatch = useCallback(
    (action: CampaignAction, opts?: { snapshotLabel?: string }) => {
      setCampaignState((prev) => {
        if (!prev) return prev;
        try {
          const next = reduceCampaign(prev, action);
          setHistory((h) => [...h.slice(-49), prev]);
          persist(next, opts?.snapshotLabel);
          return next;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setLastError(msg);
          toast(msg, "danger");
          return prev;
        }
      });
    },
    [persist, toast],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setCampaignState(prev);
      persist(prev, "undo");
      return h.slice(0, -1);
    });
  }, [persist]);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const value: AppStore = {
    campaign,
    rules: rules5e2024,
    setCampaign,
    dispatch,
    undo,
    canUndo: history.length > 0,
    combat,
    setCombat,
    ai: aiBundle.service,
    aiReason: aiBundle.reason,
    assets,
    settings,
    updateSettings,
    online,
    saving,
    dirty,
    lastSavedAt,
    lastError,
    toasts,
    toast,
    dismissToast,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside AppProvider");
  return v;
}

/** Like useStore but guarantees a loaded campaign (screens that require one). */
export function useCampaign(): AppStore & { campaign: Campaign } {
  const s = useStore();
  if (!s.campaign) throw new Error("No campaign loaded");
  return s as AppStore & { campaign: Campaign };
}
