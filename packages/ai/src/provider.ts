/**
 * The boundary between Cardinal and any LLM. The app and the generators only
 * ever see this interface, so models, prompts and providers can be swapped
 * without touching UI or state code.
 */
import type { ZodType } from "zod";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface GenerationRequest<T> {
  /** Generator name, e.g. "npcCard". Used for logging and by the mock provider. */
  name: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  /** Structured input the generator was given; providers may ignore it (the mock uses it). */
  context?: unknown;
  maxTokens?: number;
  effort?: Effort;
  signal?: AbortSignal;
}

export interface ProviderResponse<T> {
  output: T;
  rawText?: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number };
}

export interface LLMProvider {
  readonly id: string;
  generate<T>(req: GenerationRequest<T>): Promise<ProviderResponse<T>>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "refusal" | "malformed" | "network" | "auth" | "rate-limit" | "unknown",
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
