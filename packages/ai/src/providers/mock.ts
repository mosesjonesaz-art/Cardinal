/**
 * Deterministic provider for tests, offline play and demos. Handlers receive the
 * structured `context` the generator built and return an output object; the
 * service validates it exactly as it would a real model's output, so tests can
 * simulate malformed generations, refusals and timeouts.
 */
import type { GenerationRequest, LLMProvider, ProviderResponse } from "../provider.js";
import { ProviderError } from "../provider.js";

export type MockHandler = (context: unknown, req: GenerationRequest<unknown>) => unknown;

export interface MockProviderOptions {
  handlers?: Record<string, MockHandler>;
  /** Simulated latency. */
  delayMs?: number;
}

export class MockProvider implements LLMProvider {
  readonly id = "mock";
  private handlers: Record<string, MockHandler>;
  private delayMs: number;
  private failNext: ProviderError | null = null;
  readonly calls: { name: string; system: string; user: string }[] = [];

  constructor(opts: MockProviderOptions = {}) {
    this.handlers = { ...opts.handlers };
    this.delayMs = opts.delayMs ?? 0;
  }

  on(name: string, handler: MockHandler): this {
    this.handlers[name] = handler;
    return this;
  }

  /** Makes the next call fail with the given error kind (e.g. to test fail-soft paths). */
  failOnce(kind: ProviderError["kind"], message = `mock ${kind}`): this {
    this.failNext = new ProviderError(message, kind);
    return this;
  }

  setDelay(ms: number): this {
    this.delayMs = ms;
    return this;
  }

  async generate<T>(req: GenerationRequest<T>): Promise<ProviderResponse<T>> {
    this.calls.push({ name: req.name, system: req.system, user: req.user });
    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, this.delayMs);
        req.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new ProviderError("aborted", "timeout"));
        });
      });
    }
    if (this.failNext) {
      const e = this.failNext;
      this.failNext = null;
      throw e;
    }
    const handler = this.handlers[req.name];
    if (!handler) throw new ProviderError(`Mock has no handler for "${req.name}"`, "unknown");
    const raw = handler(req.context, req as GenerationRequest<unknown>);
    return { output: raw as T, rawText: JSON.stringify(raw), model: "mock" };
  }
}
