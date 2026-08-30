/**
 * Per-stage timing, token and cost accounting for one pipeline run.
 *
 * Every model call in the request path records a span here, so a response can
 * carry an honest breakdown of where its latency and its money went instead of
 * a single opaque duration. The demo renders this; the evaluation harness sums
 * it. Nothing estimates: token counts come from the API's own usage metadata,
 * and a call whose response omits usage is recorded as unknown rather than
 * guessed at.
 */

export type SpanKind = "embed" | "retrieve" | "rerank" | "generate" | "ground";

import { classifyFailure } from "@/lib/errors/public-error";

export interface Span {
  name: string;
  kind: SpanKind;
  startedAt: number;
  durationMs: number;
  /** From the provider's usage metadata. Null when the provider did not report it. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** True when the result came from a cache and no provider call was made. */
  cached: boolean;
  model?: string;
  error?: string;
}

/**
 * Published Gemini pricing, US dollars per million tokens, as of 2026-08.
 *
 * Held here as a constant so a cost figure can always be traced to a rate that
 * is written down. If the rate is stale the cost is wrong in a way anyone can
 * check, which is the point; a cost derived from a number nobody can find is
 * worse than no cost at all.
 */
export const PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gemini-3.6-flash": { input: 0.3, output: 2.5 },
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

export interface TraceSummary {
  totalMs: number;
  spans: Span[];
  totals: {
    inputTokens: number;
    outputTokens: number;
    /**
     * Cost of the generation calls at published rates. Null only when a
     * generation span reported no usage, so a partial sum is never presented
     * as a complete one.
     */
    estimatedCostUsd: number | null;
    /**
     * Embedding calls made, whose cost is not included above. Gemini's
     * batchEmbedContents does not return usage metadata, so their token count
     * is unknown — and an unknown is reported as an unknown rather than
     * estimated from character counts and quietly added to the total.
     */
    unpricedEmbeddingCalls: number;
    cachedSpans: number;
  };
}

export class Trace {
  private readonly spans: Span[] = [];
  private readonly startedAt = Date.now();

  /** Times `fn`, records a span, and returns whatever `fn` returned. */
  async record<T>(
    name: string,
    kind: SpanKind,
    fn: () => Promise<{ value: T; inputTokens?: number | null; outputTokens?: number | null; cached?: boolean; model?: string }>
  ): Promise<T> {
    const startedAt = Date.now();
    try {
      const outcome = await fn();
      this.spans.push({
        name,
        kind,
        startedAt,
        durationMs: Date.now() - startedAt,
        inputTokens: outcome.inputTokens ?? null,
        outputTokens: outcome.outputTokens ?? null,
        cached: outcome.cached ?? false,
        model: outcome.model,
      });
      return outcome.value;
    } catch (error) {
      this.spans.push({
        name,
        kind,
        startedAt,
        durationMs: Date.now() - startedAt,
        inputTokens: null,
        outputTokens: null,
        cached: false,
        // Classified, not copied. A trace summary is returned to the browser
        // alongside the results, so a span that recorded `error.message`
        // verbatim published whatever the upstream provider chose to say — the
        // same disclosure the route handlers had, reached by a different path,
        // and not fixed by fixing them. The operator detail is already in the
        // server log via the route's own handler; a visitor needs to know that
        // a span failed and roughly why, which a kind conveys.
        error: classifyFailure(error),
      });
      throw error;
    }
  }

  /** Records an already-completed step, for work that is not a single awaited call. */
  add(span: Omit<Span, "startedAt"> & { startedAt?: number }): void {
    this.spans.push({ startedAt: span.startedAt ?? Date.now(), ...span });
  }

  summary(): TraceSummary {
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd = 0;
    let costIsComplete = true;
    let cachedSpans = 0;
    let unpricedEmbeddingCalls = 0;

    for (const span of this.spans) {
      if (span.cached) cachedSpans++;

      if (span.kind === "embed") {
        // The embeddings endpoint returns no usage metadata. These are counted
        // and excluded rather than guessed at.
        if (!span.cached) unpricedEmbeddingCalls++;
        continue;
      }

      if (span.inputTokens === null && span.outputTokens === null) {
        // Retrieval and grounding are local computation with no tokens. Only a
        // model span with missing usage makes the cost incomplete.
        if (!span.cached && (span.kind === "generate" || span.kind === "rerank")) {
          costIsComplete = false;
        }
        continue;
      }

      inputTokens += span.inputTokens ?? 0;
      outputTokens += span.outputTokens ?? 0;

      const rate = span.model ? PRICING_USD_PER_MTOK[span.model] : undefined;
      if (!rate) {
        costIsComplete = false;
        continue;
      }
      costUsd += ((span.inputTokens ?? 0) / 1e6) * rate.input;
      costUsd += ((span.outputTokens ?? 0) / 1e6) * rate.output;
    }

    return {
      totalMs: Date.now() - this.startedAt,
      spans: this.spans,
      totals: {
        inputTokens,
        outputTokens,
        estimatedCostUsd: costIsComplete ? costUsd : null,
        unpricedEmbeddingCalls,
        cachedSpans,
      },
    };
  }
}
