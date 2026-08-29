import { z } from "zod";

import { generateStructured } from "../ai/gemini-client";
import type { Trace } from "../telemetry/trace";
import type { ScoredChunk } from "./types";

/**
 * Listwise reranking of fused candidates.
 *
 * A cross-encoder would be the textbook choice, but shipping one means shipping
 * a model — ONNX runtime, weights, a cold start measured in seconds on a
 * serverless function. Using the generation model as a listwise reranker keeps
 * the deployment to a single dependency and, unlike a pointwise LLM scorer, it
 * sees the candidates together, which is the whole reason reranking helps.
 *
 * The candidates are labelled by position rather than by chunk id, because ids
 * carry the framework and citation and the model will otherwise rank on those
 * instead of on the text. Positions are shuffled for the same reason: without
 * it the model inherits the fusion order and largely reproduces it, which makes
 * the rerank look effective while doing nothing.
 */

const RerankSchema = z.object({
  ranking: z
    .array(
      z.object({
        id: z.number().int().min(0),
        relevance: z.number().min(0).max(3),
      })
    )
    .min(1),
});

export interface RerankOptions {
  topK: number;
  trace?: Trace;
  /** Deterministic permutation seed, so the eval harness is reproducible. */
  seed?: number;
}

/** Mulberry32 — small, deterministic, adequate for shuffling a candidate list. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SYSTEM = [
  "You rank passages of regulation text by how well they answer a compliance question.",
  "",
  "Grade each passage 0-3:",
  "  3 — directly answers the question; the requirement asked about is stated here.",
  "  2 — substantially relevant; covers the same obligation from a different angle.",
  "  1 — related topic, but does not answer the question.",
  "  0 — not relevant.",
  "",
  "Judge only the passage text. Do not reward a passage for citing a well-known",
  "section number. Return every passage id you were given, exactly once.",
].join("\n");

export async function rerank(
  query: string,
  candidates: ScoredChunk[],
  options: RerankOptions
): Promise<ScoredChunk[]> {
  if (candidates.length === 0) return [];
  if (candidates.length === 1) return candidates.slice(0, options.topK);

  const order = candidates.map((_, i) => i);
  const random = seededRandom(options.seed ?? 1);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const presented = order.map((originalIndex, position) => ({
    position,
    originalIndex,
    chunk: candidates[originalIndex].chunk,
  }));

  const prompt = [
    `Question: ${query}`,
    "",
    "Passages:",
    ...presented.map(
      (p) =>
        `[${p.position}] ${p.chunk.heading}\n${p.chunk.text.slice(0, 700)}`
    ),
    "",
    `Return JSON: {"ranking":[{"id":<passage id>,"relevance":<0-3>}, ...]} for all ${presented.length} passages.`,
  ].join("\n\n");

  const judged = await generateStructured(prompt, RerankSchema, {
    system: SYSTEM,
    temperature: 0,
    maxOutputTokens: 8192,
    trace: options.trace,
    label: "rerank",
  });

  const relevanceByPosition = new Map<number, number>();
  for (const entry of judged.ranking) {
    if (entry.id < presented.length) relevanceByPosition.set(entry.id, entry.relevance);
  }

  // A candidate the model failed to return keeps its place behind everything it
  // did grade, rather than being dropped. Dropping it would let an incomplete
  // reply silently shrink the result set.
  return presented
    .map((p) => ({
      chunk: p.chunk,
      relevance: relevanceByPosition.get(p.position) ?? -1,
      fusedRank: candidates[p.originalIndex].rank,
    }))
    .sort((a, b) => b.relevance - a.relevance || a.fusedRank - b.fusedRank)
    .slice(0, options.topK)
    .map((entry, i) => ({ chunk: entry.chunk, score: entry.relevance, rank: i + 1 }));
}
