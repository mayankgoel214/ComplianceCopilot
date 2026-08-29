/** A retrievable unit of regulation text. */
export interface Chunk {
  /** Stable id: `<framework-slug>:<citation-slug>:<ordinal>`. */
  id: string;
  framework: string;
  citation: string;
  heading: string;
  source: string;
  sourceUrl: string;
  text: string;
  tokens: number;
  /** Ordinal of this chunk within its source section. */
  ordinal: number;
  /** How many chunks the source section produced. */
  ordinalOf: number;
}

export interface ScoredChunk {
  chunk: Chunk;
  /** Score in whatever scale the producing retriever uses. Not comparable across retrievers. */
  score: number;
  /** 1-based rank within the producing retriever's own result list. */
  rank: number;
}

export type RetrievalMode = "dense" | "bm25" | "hybrid" | "hybrid_rerank";

export interface RetrievalOptions {
  mode?: RetrievalMode;
  /** Results returned to the caller. */
  topK?: number;
  /** Candidates each arm contributes before fusion. */
  candidateK?: number;
  /** Restrict to one framework. */
  framework?: string;
  /** Use int8-quantized vectors instead of float32. */
  quantized?: boolean;
  /** Per-arm weights for the fused modes. */
  weights?: { dense: number; lexical: number };
}

export interface RetrievalResult {
  mode: RetrievalMode;
  results: ScoredChunk[];
  /** Per-arm timings, in milliseconds. Absent arms did not run. */
  timings: {
    embedMs?: number;
    denseMs?: number;
    bm25Ms?: number;
    fuseMs?: number;
    rerankMs?: number;
    totalMs: number;
  };
  /** Populated for fused modes so a caller can show where each result came from. */
  provenance?: Record<string, { denseRank?: number; bm25Rank?: number }>;
}
