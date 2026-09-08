import type { ZodType } from "zod";
import type { Effort } from "./provider.js";

export interface PromptSpec {
  system: string;
  user: string;
  maxTokens?: number;
  effort?: Effort;
}

export interface PostValidation<O> {
  output: O;
  issues: string[];
}

/**
 * A generator is a pure description of one AI task: how to prompt, what shape
 * comes back, how to sanity-check it against the core, and what to show the DM
 * if the model is unavailable (Fail-soft defaults).
 */
export interface Generator<I, O> {
  name: string;
  schema: ZodType<O>;
  buildPrompt(input: I): PromptSpec;
  /** Runs after schema validation; clamps/drops bad values and explains what changed. */
  postValidate?(output: O, input: I): PostValidation<O>;
  /** Must never throw and must satisfy `schema`. */
  fallback(input: I): O;
  /** A JSON-safe summary of the input for the generation log. */
  summarizeInput?(input: I): unknown;
}

export function defineGenerator<I, O>(g: Generator<I, O>): Generator<I, O> {
  return g;
}
