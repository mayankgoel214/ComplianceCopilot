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

    // The query is normalised here, and it was not before.
    //
    // The corpus vectors are unit length — the build does that explicitly — so
    // a plain dot product against a unit query is the cosine similarity. But
    // Gemini does not return unit vectors for queries: measured, a query
    // embedding has a norm of about 0.59. The dot product was therefore
    // |q| times the cosine, and every score shown on the retrieval playground
    // was a constant factor too small.
    //
    // Ranking was never affected — scaling by a positive constant preserves
    // order — so the evaluation numbers were and remain correct. It was the
    // displayed number that was wrong, and it was wrong next to a pgvector path
    // that computes true cosine, which is how it was caught.
    const query = normalise(queryVector);

    const scored: Array<{ index: number; score: number }> = [];
    for (let i = 0; i < this.count; i++) {
      if (allowed && !allowed(this.chunks[i])) continue;
      const offset = i * this.dimensions;
      let dot = 0;
      for (let d = 0; d < this.dimensions; d++) dot += this.matrix[offset + d] * query[d];
      scored.push({ index: i, score: dot });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored
      .slice(0, topK)
      .map(({ index, score }, i) => ({ chunk: this.chunks[index], score, rank: i + 1 }));
  }
}

/**
 * Returns a unit-length copy, or the input when it already is one.
 *
 * A zero vector cannot be normalised and is returned untouched rather than
 * turned into NaNs — the embedding service rejects them, and a silently
 * NaN-filled query is the kind of failure that looks like bad retrieval rather
 * than like a bug.
 */
function normalise(vector: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  const norm = Math.sqrt(sum);
  if (!Number.isFinite(norm) || norm === 0 || Math.abs(norm - 1) < 1e-6) return vector;

  const out = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i++) out[i] = vector[i] / norm;
  return out;
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
