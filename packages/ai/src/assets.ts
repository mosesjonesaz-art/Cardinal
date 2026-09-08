/**
 * Voice sample & reference art: generated once per NPC persona, cached, reused.
 * Mood variation is layered as a directive over the cached base voice rather
 * than regenerating audio. Providers are pluggable; the stub returns null so the
 * UI degrades to "perform from the profile" (fail-soft).
 */
import type { Npc, NpcMood, VoiceProfile } from "@cardinal/core";
import { hashSeed } from "@cardinal/core";

export interface AssetBlob {
  bytes: Uint8Array;
  mimeType: string;
  createdAt: string;
  meta?: Record<string, unknown>;
}

export interface AssetCache {
  get(key: string): Promise<AssetBlob | undefined>;
  put(key: string, blob: AssetBlob): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export interface AssetGenerator {
  readonly id: string;
  /** Returns null when the capability is unavailable (no provider configured, offline...). */
  generateVoiceSample(npc: Npc, sampleText: string): Promise<AssetBlob | null>;
  generatePortrait(npc: Npc, prompt: string): Promise<AssetBlob | null>;
}

export class MemoryAssetCache implements AssetCache {
  private store = new Map<string, AssetBlob>();
  async get(key: string) {
    return this.store.get(key);
  }
  async put(key: string, blob: AssetBlob) {
    this.store.set(key, blob);
  }
  async delete(key: string) {
    this.store.delete(key);
  }
  async keys() {
    return [...this.store.keys()];
  }
}

export class StubAssetGenerator implements AssetGenerator {
  readonly id = "stub";
  async generateVoiceSample(): Promise<AssetBlob | null> {
    return null;
  }
  async generatePortrait(): Promise<AssetBlob | null> {
    return null;
  }
}

export function voiceProfileHash(voice: VoiceProfile): string {
  return hashSeed(JSON.stringify(voice)).toString(36);
}

export function voiceAssetKey(npc: Npc): string {
  return `voice:${npc.id}:${voiceProfileHash(npc.voice)}`;
}

export function portraitAssetKey(npc: Npc): string {
  return `portrait:${npc.id}:${hashSeed(npc.appearance + "|" + npc.role).toString(36)}`;
}

/** Text directive layered on top of the cached base voice for the current mood. */
export function moodVoiceDirective(voice: VoiceProfile, mood: NpcMood): string {
  const base = `Base: ${voice.pitch} pitch, ${voice.pace} pace${voice.texture ? `, ${voice.texture}` : ""}${voice.accent ? `, ${voice.accent} accent` : ""}.`;
  const moods: Record<NpcMood, string> = {
    calm: "Even, unhurried; let sentences land.",
    warm: "Slightly higher, smiling; softer consonants.",
    wary: "Quieter, clipped; pauses before answers.",
    hostile: "Lower, harder; no warmth, short sentences.",
    afraid: "Faster, breathier; voice cracks on stressed words.",
    grieving: "Slower, flatter; trails off at sentence ends.",
    elated: "Faster, brighter; laughs between phrases.",
    scheming: "Measured, silky; emphasise the last word of each line.",
    bored: "Monotone, drawn-out vowels; sighs.",
    desperate: "Rushed, rising pitch; repeats key words.",
  };
  return `${base} Mood (${mood}): ${moods[mood]}`;
}

export interface NpcAssetResult {
  blob: AssetBlob | null;
  key: string;
  source: "cache" | "generated" | "unavailable";
}

export class NpcAssetService {
  constructor(
    private readonly cache: AssetCache,
    private readonly generator: AssetGenerator,
  ) {}

  async getVoiceSample(npc: Npc, sampleText?: string): Promise<NpcAssetResult> {
    const key = voiceAssetKey(npc);
    const cached = await this.cache.get(key);
    if (cached) return { blob: cached, key, source: "cache" };
    const text = sampleText ?? npc.voice.catchphrases[0] ?? `${npc.name} clears their throat and speaks.`;
    const blob = await this.generator.generateVoiceSample(npc, text);
    if (!blob) return { blob: null, key, source: "unavailable" };
    await this.cache.put(key, blob);
    return { blob, key, source: "generated" };
  }

  async getPortrait(npc: Npc): Promise<NpcAssetResult> {
    const key = portraitAssetKey(npc);
    const cached = await this.cache.get(key);
    if (cached) return { blob: cached, key, source: "cache" };
    const prompt = `Portrait of ${npc.name}${npc.role ? `, ${npc.role}` : ""}. ${npc.appearance}`.trim();
    const blob = await this.generator.generatePortrait(npc, prompt);
    if (!blob) return { blob: null, key, source: "unavailable" };
    await this.cache.put(key, blob);
    return { blob, key, source: "generated" };
  }
}
