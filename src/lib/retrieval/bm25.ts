import { Chunk, ScoredChunk } from "./types";
import { tokenize } from "./tokenizer";

/**
 * Okapi BM25 over the corpus, built in memory at load time.
 *
 * Written out rather than delegated to Postgres `ts_rank_cd`, for two reasons:
 * the deployed app has no database to delegate to, and `ts_rank_cd` is not
 * BM25 — it has no document-length normalisation, so long regulation sections
 * outrank short ones for no reason a user would accept. The parameters below
 * are the standard defaults; `b` matters here because section lengths in the
 * corpus span roughly two orders of magnitude.
 */
const K1 = 1.2;
const B = 0.75;

interface Posting {
  docIndex: number;
  termFrequency: number;
}

export class BM25Index {
  private readonly postings = new Map<string, Posting[]>();
  private readonly docLengths: number[] = [];
  private averageDocLength = 0;

  constructor(private readonly chunks: Chunk[]) {
    for (let i = 0; i < chunks.length; i++) {
      // Citation and heading are indexed alongside the body, matching exactly
      // what the dense arm embeds (see `embeddingText` in chunker.ts).
      //
      // The citation was originally left out, and the effect was a benchmark
      // that flattered dense retrieval: a query like "45 CFR 164.312" could be
      // answered by the dense arm, whose embedded text contained the citation,
      // and not by BM25, whose index did not. That is a defect in the
      // measurement rather than a property of BM25.
      const terms = tokenize(
        `${chunks[i].citation}\n${chunks[i].heading}\n${chunks[i].text}`
      );
      this.docLengths.push(terms.length);

      const counts = new Map<string, number>();
      for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);

      for (const [term, termFrequency] of counts) {
        let list = this.postings.get(term);
        if (!list) {
          list = [];
          this.postings.set(term, list);
        }
        list.push({ docIndex: i, termFrequency });
      }
    }

    const total = this.docLengths.reduce((a, b) => a + b, 0);
    this.averageDocLength = this.docLengths.length > 0 ? total / this.docLengths.length : 0;
  }

  get size(): number {
    return this.chunks.length;
  }

  get vocabularySize(): number {
    return this.postings.size;
  }

  search(query: string, topK: number, allowed?: (chunk: Chunk) => boolean): ScoredChunk[] {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return [];

    const scores = new Map<number, number>();
    const N = this.chunks.length;

    for (const term of new Set(queryTerms)) {
      const list = this.postings.get(term);
      if (!list) continue;

      // Robertson/Sparck-Jones idf with the +1 guard, so a term appearing in
      // more than half the corpus contributes a small positive weight rather
      // than a negative one.
      const df = list.length;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

      for (const { docIndex, termFrequency } of list) {
        if (allowed && !allowed(this.chunks[docIndex])) continue;
        const norm =
          termFrequency +
          K1 * (1 - B + (B * this.docLengths[docIndex]) / (this.averageDocLength || 1));
        scores.set(docIndex, (scores.get(docIndex) ?? 0) + (idf * termFrequency * (K1 + 1)) / norm);
      }
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK)
      .map(([docIndex, score], i) => ({ chunk: this.chunks[docIndex], score, rank: i + 1 }));
  }
}
