/**
 * Local log of every generation: inputs, prompt, raw output, validated output,
 * issues, and why a fallback was used. The inspector view reads this.
 */
export interface GenerationLogEntry {
  id: string;
  at: string;
  generator: string;
  provider: string;
  source: "llm" | "fallback";
  durationMs: number;
  model?: string;
  /** Structured input summary (JSON-safe). */
  input: unknown;
  prompt: { system: string; user: string };
  rawOutput?: unknown;
  output: unknown;
  issues: string[];
  error?: string;
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number };
}

export interface GenerationLogSink {
  append(entry: GenerationLogEntry): void | Promise<void>;
}

export class GenerationLog {
  private entries: GenerationLogEntry[] = [];
  private counter = 0;
  constructor(
    private readonly capacity = 200,
    private readonly sink?: GenerationLogSink,
  ) {}

  nextId(): string {
    this.counter += 1;
    return `gen_${Date.now().toString(36)}_${this.counter}`;
  }

  append(entry: GenerationLogEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.splice(0, this.entries.length - this.capacity);
    void this.sink?.append(entry);
  }

  /** Newest first. */
  list(limit = 50): GenerationLogEntry[] {
    return [...this.entries].reverse().slice(0, limit);
  }

  get(id: string): GenerationLogEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  clear(): void {
    this.entries = [];
  }

  get size(): number {
    return this.entries.length;
  }
}
