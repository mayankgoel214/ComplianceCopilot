import { readFile } from "node:fs/promises";
import path from "node:path";

import { BM25Index } from "./bm25";
import { DenseIndex, quantizeInt8, dequantize } from "./vectors";
import { reciprocalRankFusion, DEFAULT_FUSION_WEIGHTS, type FusionWeights } from "./fusion";
import type {
  Chunk,
  RetrievalMode,
  RetrievalOptions,
  RetrievalResult,
  ScoredChunk,
} from "./types";

export interface IndexMeta {
  builtFrom: string;
  embeddingModel: string;
  dimensions: number;
  chunking: { targetTokens: number; overlapTokens: number; minTokens: number };
  sectionCount: number;
  chunkCount: number;
  frameworks: string[];
}

export interface QueryEmbedder {
  (query: string): Promise<number[]>;
}

/**
 * The retrieval index, loaded once per process.
 *
 * The corpus is around a thousand chunks. At that size an exhaustive scan of a
 * flat vector matrix takes single-digit milliseconds, so there is no
 * approximate index here and no vector database behind it — both would add a
 * moving part and a recall loss to solve a problem this corpus does not have.
 * The pgvector backend in `pgvector-store.ts` exists for corpora that outgrow
 * this one, and is exercised against a real Postgres in the integration tests.
 */
export class RetrievalStore {
  private constructor(
    readonly meta: IndexMeta,
    readonly chunks: Chunk[],
    private readonly byId: Map<string, Chunk>,
    private readonly dense: DenseIndex,
    private readonly denseQuantized: DenseIndex,
    private readonly bm25: BM25Index
  ) {}

  static async load(dataDir = "data"): Promise<RetrievalStore> {
    const corpusRaw = await readFile(path.join(dataDir, "corpus.json"), "utf8");
    const { meta, chunks } = JSON.parse(corpusRaw) as { meta: IndexMeta; chunks: Chunk[] };

    const buffer = await readFile(path.join(dataDir, "embeddings.f32.bin"));
    const matrix = new Float32Array(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
    );

    const expected = chunks.length * meta.dimensions;
    if (matrix.length !== expected) {
      throw new Error(
        `Index is inconsistent: ${chunks.length} chunks × ${meta.dimensions} dims needs ${expected} floats, the vector file holds ${matrix.length}. Rebuild with scripts/build-index.mts.`
      );
    }

    const quantized = dequantize(quantizeInt8(matrix, meta.dimensions));

    return new RetrievalStore(
      meta,
      chunks,
      new Map(chunks.map((c) => [c.id, c])),
      new DenseIndex(chunks, matrix, meta.dimensions),
      new DenseIndex(chunks, quantized, meta.dimensions),
      new BM25Index(chunks)
    );
  }

  get vocabularySize(): number {
    return this.bm25.vocabularySize;
  }

  getChunk(id: string): Chunk | undefined {
    return this.byId.get(id);
  }

  /**
   * Runs one retrieval configuration.
   *
   * `embedQuery` is injected rather than imported so the evaluation harness can
   * drive this with a cached embedder and the request path can drive it with
   * the live service, without either of them being a special case.
   */
  async search(
    query: string,
    embedQuery: QueryEmbedder,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const mode: RetrievalMode = options.mode ?? "hybrid";
    const topK = options.topK ?? 10;
    const candidateK = options.candidateK ?? Math.max(topK * 5, 50);
    const allowed = options.framework
      ? (chunk: Chunk) => chunk.framework === options.framework
      : undefined;

    const started = Date.now();
    const timings: RetrievalResult["timings"] = { totalMs: 0 };

    const runDense = async (): Promise<ScoredChunk[]> => {
      const t0 = Date.now();
      const vector = await embedQuery(query);
      timings.embedMs = Date.now() - t0;
      if (vector.length !== this.meta.dimensions) {
        throw new Error(
          `Query embedded to ${vector.length} dimensions; the index is ${this.meta.dimensions}`
        );
      }
      const t1 = Date.now();
      const index = options.quantized ? this.denseQuantized : this.dense;
      const hits = index.search(Float32Array.from(vector), candidateK, allowed);
      timings.denseMs = Date.now() - t1;
      return hits;
    };

    const runBm25 = (): ScoredChunk[] => {
      const t0 = Date.now();
      const hits = this.bm25.search(query, candidateK, allowed);
      timings.bm25Ms = Date.now() - t0;
      return hits;
    };

    if (mode === "dense") {
      const results = (await runDense()).slice(0, topK);
      timings.totalMs = Date.now() - started;
      return { mode, results, timings };
    }

    if (mode === "bm25") {
      const results = runBm25().slice(0, topK);
      timings.totalMs = Date.now() - started;
      return { mode, results, timings };
    }

    // Both fused modes share this stage; `hybrid_rerank` is this plus a rerank
    // pass, which lives in rerank.ts so the store carries no model dependency.
    const [denseHits, lexicalHits] = await Promise.all([
      runDense(),
      Promise.resolve(runBm25()),
    ]);

    const t0 = Date.now();
    const fused = reciprocalRankFusion(denseHits, lexicalHits, topK, options.weights ?? DEFAULT_FUSION_WEIGHTS);
    timings.fuseMs = Date.now() - t0;
    timings.totalMs = Date.now() - started;

    const provenance: Record<string, { denseRank?: number; bm25Rank?: number }> = {};
    for (const item of fused) provenance[item.chunk.id] = item.contributions;

    return {
      mode: "hybrid",
      results: fused.map(({ chunk, score, rank }) => ({ chunk, score, rank })),
      timings,
      provenance,
    };
  }

  /** Candidates for a rerank pass: fused, but wider than the final result set. */
  async candidatesForRerank(
    query: string,
    embedQuery: QueryEmbedder,
    candidateK: number,
    framework?: string,
    weights?: FusionWeights
  ): Promise<RetrievalResult> {
    return this.search(query, embedQuery, {
      mode: "hybrid",
      topK: candidateK,
      candidateK,
      framework,
      weights,
    });
  }
}

let cached: Promise<RetrievalStore> | null = null;

/** Process-wide singleton. A serverless instance loads the index once and
 *  serves every request it handles from memory. */
export function getRetrievalStore(dataDir = "data"): Promise<RetrievalStore> {
  if (!cached) cached = RetrievalStore.load(dataDir);
  return cached;
}
