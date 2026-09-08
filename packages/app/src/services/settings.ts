/** Device-local settings (never part of the campaign save). */
export interface AppSettings {
  provider: "mock" | "anthropic";
  apiKey: string;
  model: string;
  /** Live-table timeout in ms. */
  liveTimeoutMs: number;
  /** Prep timeout in ms. */
  prepTimeoutMs: number;
}

const KEY = "cardinal.settings.v1";

export const defaultSettings: AppSettings = {
  provider: "mock",
  apiKey: "",
  model: "claude-opus-5",
  liveTimeoutMs: 20_000,
  prepTimeoutMs: 90_000,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings;
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return defaultSettings;
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode etc. */
  }
}
