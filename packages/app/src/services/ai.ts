/**
 * Builds the generation service from settings. The app only ever talks to
 * GenerationService; the provider behind it can change at runtime.
 */
import { AnthropicProvider, GenerationLog, GenerationService, MockProvider, NpcAssetService, StubAssetGenerator, defaultMockHandlers, type LLMProvider } from "@cardinal/ai";
import { IdbAssetCache, IdbGenerationLogSink } from "../persistence/db.js";
import type { AppSettings } from "./settings.js";

export function makeProvider(settings: AppSettings, online: boolean): { provider: LLMProvider; reason: string } {
  if (settings.provider === "anthropic" && settings.apiKey && online) {
    return {
      provider: new AnthropicProvider({ apiKey: settings.apiKey, model: settings.model, timeoutMs: settings.prepTimeoutMs, dangerouslyAllowBrowser: true }),
      reason: `Anthropic (${settings.model})`,
    };
  }
  if (settings.provider === "anthropic" && !settings.apiKey) return { provider: new MockProvider({ handlers: defaultMockHandlers }), reason: "No API key set: offline mock content" };
  if (settings.provider === "anthropic" && !online) return { provider: new MockProvider({ handlers: defaultMockHandlers }), reason: "Offline: mock content until connection returns" };
  return { provider: new MockProvider({ handlers: defaultMockHandlers }), reason: "Mock provider (demo mode)" };
}

export function makeGenerationService(settings: AppSettings, online: boolean): { service: GenerationService; reason: string } {
  const { provider, reason } = makeProvider(settings, online);
  const service = new GenerationService({ provider, log: new GenerationLog(200, new IdbGenerationLogSink()), timeoutMs: settings.liveTimeoutMs });
  return { service, reason };
}

export function makeAssetService(): NpcAssetService {
  // Voice/art providers are pluggable (see docs/ARCHITECTURE.md). The stub degrades to "perform from profile".
  return new NpcAssetService(new IdbAssetCache(), new StubAssetGenerator());
}
