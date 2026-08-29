import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import type { Serialized } from "@langchain/core/load/serializable";

import { AI_CONFIG, getGeminiApiKey } from "./config";
import type { Trace } from "../telemetry/trace";

/**
 * The chat model, and the callback that keeps the trace honest.
 *
 * Generation runs through LangChain: prompt templates, `withStructuredOutput`
 * and LCEL composition all earn their place, and `withStructuredOutput` in
 * particular replaces a hand-rolled parse-and-repair loop with the provider's
 * own constrained decoding.
 *
 * Embeddings deliberately do not. `GoogleGenerativeAIEmbeddings` accepts an
 * `outputDimensionality` option and does not send it, so every vector came back
 * at the model's native 3072 dimensions instead of the 768 this index is built
 * on — silently, because the option is accepted rather than rejected. Those
 * calls go straight to the REST API in `gemini-embeddings.ts`, and that is a
 * decision about one broken wrapper rather than about the framework.
 */

/**
 * Bridges LangChain's callbacks into the existing Trace.
 *
 * Token counts come from the provider's usage metadata by way of
 * `llmOutput.tokenUsage`, not from an estimate. A response that reports no
 * usage is recorded as unknown, which is what stops a cost figure being
 * presented as complete when part of it was guessed.
 */
export class TraceCallbackHandler extends BaseCallbackHandler {
  name = "verity-trace";

  private readonly startedAt = new Map<string, number>();

  constructor(
    private readonly trace: Trace,
    private readonly label: string
  ) {
    super();
  }

  handleLLMStart(_llm: Serialized, _prompts: string[], runId: string): void {
    this.startedAt.set(runId, Date.now());
  }

  handleLLMEnd(output: LLMResult, runId: string): void {
    const started = this.startedAt.get(runId) ?? Date.now();
    this.startedAt.delete(runId);

    const usage = output.llmOutput?.tokenUsage as
      | { promptTokens?: number; completionTokens?: number }
      | undefined;

    this.trace.add({
      name: this.label,
      kind: "generate",
      startedAt: started,
      durationMs: Date.now() - started,
      inputTokens: usage?.promptTokens ?? null,
      outputTokens: usage?.completionTokens ?? null,
      cached: false,
      model: AI_CONFIG.gemini.model,
    });
  }

  handleLLMError(error: unknown, runId: string): void {
    const started = this.startedAt.get(runId) ?? Date.now();
    this.startedAt.delete(runId);

    this.trace.add({
      name: this.label,
      kind: "generate",
      startedAt: started,
      durationMs: Date.now() - started,
      inputTokens: null,
      outputTokens: null,
      cached: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function createChatModel(options: { maxOutputTokens?: number; temperature?: number } = {}) {
  return new ChatGoogleGenerativeAI({
    apiKey: getGeminiApiKey(),
    model: AI_CONFIG.gemini.model,
    temperature: options.temperature ?? 0,
    maxOutputTokens: options.maxOutputTokens ?? 8192,
    // One retry inside the client. More than that and a failing call spends a
    // visitor's whole rate-limit allowance before telling them anything.
    maxRetries: 1,
  });
}
