import { ScoredChunk, Chunk } from "./types";

/**
 * Dense vectors for the corpus, held as one contiguous Float32Array.
 *
 * Gemini returns unit-normalised vectors, and the build step re-normalises to
 * be certain, so cosine similarity is a plain dot product. Keeping the matrix
 * flat rather than as an array of arrays is what makes a 1200×768 scan fast
 * enough to do exhaustively — at this corpus size an approximate index (HNSW,
 * IVF) would add a recall loss and a dependency to save a millisecond.
 */
export class DenseIndex {
  readonly count: number;

  constructor(
    private readonly chunks: Chunk[],
    private readonly matrix: Float32Array,
    readonly dimensions: number
  ) {
    this.count = chunks.length;
    if (matrix.length !== this.count * dimensions) {
      throw new Error(
        `Dense matrix is ${matrix.length} floats; ${this.count} chunks × ${dimensions} dims needs ${this.count * dimensions}`
      );
    }
  }

  search(queryVector: Float32Array, topK: number, allowed?: (chunk: Chunk) => boolean): ScoredChunk[] {
    if (queryVector.length !== this.dimensions) {
      throw new Error(
        `Query vector has ${queryVector.length} dimensions; the index has ${this.dimensions}`
      );
    }

    const scored: Array<{ index: number; score: number }> = [];
    for (let i = 0; i < this.count; i++) {
      if (allowed && !allowed(this.chunks[i])) continue;
      const offset = i * this.dimensions;
      let dot = 0;
      for (let d = 0; d < this.dimensions; d++) dot += this.matrix[offset + d] * queryVector[d];
      scored.push({ index: i, score: dot });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored
      .slice(0, topK)
      .map(({ index, score }, i) => ({ chunk: this.chunks[index], score, rank: i + 1 }));
  }
}

/**
 * Symmetric per-vector int8 quantization.
 *
 * Each vector is scaled by its own maximum absolute component, so the scale is
 * stored alongside. This is lossy — how lossy is measured in the evaluation
 * report rather than assumed — and buys a 4× reduction in the size of the
 * artifact the serverless function has to load on a cold start.
 */
export interface QuantizedMatrix {
  data: Int8Array;
  scales: Float32Array;
  dimensions: number;
}

export function quantizeInt8(matrix: Float32Array, dimensions: number): QuantizedMatrix {
  const count = matrix.length / dimensions;
  const data = new Int8Array(matrix.length);
  const scales = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const offset = i * dimensions;
    let maxAbs = 0;
    for (let d = 0; d < dimensions; d++) {
      const v = Math.abs(matrix[offset + d]);
      if (v > maxAbs) maxAbs = v;
    }
    // A zero vector would divide by zero. It should never occur — the embedding
    // service rejects them — but a NaN-filled index is the exact class of silent
    // corruption this codebase has been bitten by before.
    const scale = maxAbs === 0 ? 1 : maxAbs / 127;
    scales[i] = scale;
    for (let d = 0; d < dimensions; d++) {
      data[offset + d] = Math.round(matrix[offset + d] / scale);
    }
  }

  return { data, scales, dimensions };
}

export function dequantize(q: QuantizedMatrix): Float32Array {
  const out = new Float32Array(q.data.length);
  const count = q.scales.length;
  for (let i = 0; i < count; i++) {
    const offset = i * q.dimensions;
    const scale = q.scales[i];
    for (let d = 0; d < q.dimensions; d++) out[offset + d] = q.data[offset + d] * scale;
  }
  return out;
}
