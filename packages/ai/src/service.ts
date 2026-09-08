/**
 * Runs generators against a provider with a timeout, validates the result at the
 * AI boundary, degrades to the generator's fallback on any failure, and logs
 * everything. Nothing here writes to campaign state: outputs are proposals the
 * DM applies through the reducer.
 */
import type { Generator } from "./generator.js";
import { GenerationLog } from "./log.js";
import type { LLMProvider } from "./provider.js";
import { ProviderError } from "./provider.js";

export interface GenerationResult<O> {
  output: O;
  source: "llm" | "fallback";
  issues: string[];
  error?: string;
  logId: string;
  durationMs: number;
}

export interface GenerationServiceOptions {
  provider: LLMProvider;
  log?: GenerationLog;
  /** Default per-call timeout (ms). Live-table calls should be short. */
  timeoutMs?: number;
  now?: () => string;
}

export interface RunOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export class GenerationService {
  readonly log: GenerationLog;
  private provider: LLMProvider;
  private readonly timeoutMs: number;
  private readonly now: () => string;

  constructor(opts: GenerationServiceOptions) {
    this.provider = opts.provider;
    this.log = opts.log ?? new GenerationLog();
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.now = opts.now ?? (() => new Date().toISOString());
  }

  get providerId(): string {
    return this.provider.id;
  }

  /** Swap models/providers at runtime (settings screen) without touching callers. */
  setProvider(provider: LLMProvider): void {
    this.provider = provider;
  }

  async run<I, O>(generator: Generator<I, O>, input: I, opts: RunOptions = {}): Promise<GenerationResult<O>> {
    const started = Date.now();
    const id = this.log.nextId();
    const prompt = generator.buildPrompt(input);
    const inputSummary = generator.summarizeInput ? generator.summarizeInput(input) : safeJson(input);
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    opts.signal?.addEventListener("abort", () => controller.abort());
    let rawOutput: unknown;
    try {
      const res = await Promise.race([
        this.provider.generate<O>({
          name: generator.name,
          system: prompt.system,
          user: prompt.user,
          schema: generator.schema,
          context: input,
          maxTokens: prompt.maxTokens,
          effort: prompt.effort,
          signal: controller.signal,
        }),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new ProviderError(`Timed out after ${timeoutMs} ms`, "timeout")))),
      ]);
      rawOutput = res.output;
      // Validate at the boundary even if the provider claims to have parsed it.
      const parsed = generator.schema.safeParse(res.output);
      if (!parsed.success) {
        throw new ProviderError(`Output failed schema validation: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`, "malformed");
      }
      let output = parsed.data;
      let issues: string[] = [];
      if (generator.postValidate) {
        const pv = generator.postValidate(output, input);
        output = pv.output;
        issues = pv.issues;
      }
      const durationMs = Date.now() - started;
      this.log.append({
        id,
        at: this.now(),
        generator: generator.name,
        provider: this.provider.id,
        source: "llm",
        durationMs,
        model: res.model,
        input: inputSummary,
        prompt: { system: prompt.system, user: prompt.user },
        rawOutput,
        output,
        issues,
        usage: res.usage,
      });
      return { output, source: "llm", issues, logId: id, durationMs };
    } catch (err) {
      const error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      const output = generator.fallback(input);
      const durationMs = Date.now() - started;
      const issues = [`Fallback used: ${error}`];
      this.log.append({
        id,
        at: this.now(),
        generator: generator.name,
        provider: this.provider.id,
        source: "fallback",
        durationMs,
        input: inputSummary,
        prompt: { system: prompt.system, user: prompt.user },
        rawOutput,
        output,
        issues,
        error,
      });
      return { output, source: "fallback", issues, error, logId: id, durationMs };
    } finally {
      clearTimeout(timer);
    }
  }
}

function safeJson(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v, (_k, val) => (typeof val === "function" ? undefined : val)));
  } catch {
    return String(v);
  }
}
