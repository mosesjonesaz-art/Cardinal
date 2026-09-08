/**
 * Anthropic adapter. Uses structured outputs (client.messages.parse + zodOutputFormat)
 * so the response is schema-validated before it leaves this file. Adaptive thinking is
 * the model default; `effort` controls latency vs depth per request (live-table calls
 * use "low", prep calls use "high").
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { GenerationRequest, LLMProvider, ProviderResponse } from "../provider.js";
import { ProviderError } from "../provider.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  /** Default: claude-opus-5. */
  model?: string;
  /** Per-request timeout in ms (SDK default is 10 minutes; live play wants far less). */
  timeoutMs?: number;
  maxRetries?: number;
  /** Required when running inside a browser (the iPad PWA). Keys live only on the DM's device. */
  dangerouslyAllowBrowser?: boolean;
  baseURL?: string;
}

export class AnthropicProvider implements LLMProvider {
  readonly id: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.model = opts.model ?? "claude-opus-5";
    this.id = `anthropic:${this.model}`;
    this.client = new Anthropic({
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs ?? 45_000,
      maxRetries: opts.maxRetries ?? 1,
      dangerouslyAllowBrowser: opts.dangerouslyAllowBrowser ?? false,
      baseURL: opts.baseURL,
    });
  }

  async generate<T>(req: GenerationRequest<T>): Promise<ProviderResponse<T>> {
    try {
      const message = await this.client.messages.parse(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 4096,
          system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
          messages: [{ role: "user", content: req.user }],
          output_config: { format: zodOutputFormat(req.schema), effort: req.effort ?? "medium" },
        },
        { signal: req.signal },
      );
      if (message.stop_reason === "refusal") {
        throw new ProviderError(`Model declined (${message.stop_details?.category ?? "unspecified"})`, "refusal");
      }
      if (message.stop_reason === "max_tokens") {
        throw new ProviderError("Output truncated at max_tokens", "malformed");
      }
      const output = message.parsed_output;
      if (output === null || output === undefined) {
        throw new ProviderError("Structured output could not be parsed", "malformed");
      }
      const rawText = (message.content as { type: string; text?: string }[]).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
      return {
        output: output as T,
        rawText,
        model: message.model,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens ?? undefined,
        },
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError("Request timed out", "timeout", err);
      if (err instanceof Anthropic.AuthenticationError) throw new ProviderError("Invalid API key", "auth", err);
      if (err instanceof Anthropic.RateLimitError) throw new ProviderError("Rate limited", "rate-limit", err);
      if (err instanceof Anthropic.APIConnectionError) throw new ProviderError("Network error", "network", err);
      if (err instanceof Anthropic.APIError) throw new ProviderError(`API error ${err.status ?? ""}: ${err.message}`, "unknown", err);
      if (err instanceof Error && err.name === "AbortError") throw new ProviderError("Request aborted", "timeout", err);
      throw new ProviderError(err instanceof Error ? err.message : String(err), "unknown", err);
    }
  }
}
