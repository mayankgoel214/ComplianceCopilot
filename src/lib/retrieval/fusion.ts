import { ScoredChunk } from "./types";

/**
 * Reciprocal Rank Fusion.
 *
 * Chosen over a weighted sum of scores because BM25 scores and cosine
 * similarities live on incomparable scales — BM25 is unbounded and corpus
 * dependent, cosine is [-1, 1] — so any weighted sum needs a normalisation step
 * whose constants are fitted to one corpus and quietly wrong on the next. RRF
 * reads only the ranks, so it has nothing to fit.
 *
 * k = 60 is the value from Cormack et al. (2009), where it was tuned across
 * TREC collections. It is not tuned here.
 *
 * The arm weights are. Plain RRF gives both arms an equal vote, which is only
 * the right prior when they are of comparable quality; on this corpus dense
 * retrieval is far stronger than BM25, and equal-weight fusion measurably drags
 * the fused ranking below dense alone. The weight is the single fitted
 * parameter in the retrieval stack, and it is fitted on the development slice
 * of the gold set only — see docs/retrieval-eval.md.
 */
const RRF_K = 60;

export interface FusionWeights {
  dense: number;
  lexical: number;
}

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = { dense: 1, lexical: 1 };

export interface FusedResult extends ScoredChunk {
  contributions: { denseRank?: number; bm25Rank?: number };
}

export function reciprocalRankFusion(
  dense: ScoredChunk[],
  lexical: ScoredChunk[],
  topK: number,
  weights: FusionWeights = DEFAULT_FUSION_WEIGHTS,
  k: number = RRF_K
): FusedResult[] {
  const accumulator = new Map<
    string,
    { chunk: ScoredChunk["chunk"]; score: number; denseRank?: number; bm25Rank?: number }
  >();

  const add = (list: ScoredChunk[], key: "denseRank" | "bm25Rank", weight: number) => {
    for (const item of list) {
      const existing = accumulator.get(item.chunk.id) ?? { chunk: item.chunk, score: 0 };
      existing.score += weight / (k + item.rank);
      existing[key] = item.rank;
      accumulator.set(item.chunk.id, existing);
    }
  };

  add(dense, "denseRank", weights.dense);
  add(lexical, "bm25Rank", weights.lexical);

  return [...accumulator.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry, i) => ({
      chunk: entry.chunk,
      score: entry.score,
      rank: i + 1,
      contributions: { denseRank: entry.denseRank, bm25Rank: entry.bm25Rank },
    }));
}
