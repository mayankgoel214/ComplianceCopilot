import { BaseRetriever, type BaseRetrieverInput } from "@langchain/core/retrievers";
import { Document } from "@langchain/core/documents";

import { getRetrievalStore, type QueryEmbedder } from "./store";
import type { RetrievalMode } from "./types";

/**
 * The retrieval stack, exposed as a LangChain retriever.
 *
 * This is the seam that lets the pipeline be composed with LCEL while the
 * ranking underneath stays the code that the evaluation actually measures.
 * Nothing here re-implements retrieval: it adapts `RetrievalStore` — the same
 * BM25, dense scan, fusion and quantization that `eval/run-eval.mts` scores — to
 * the `BaseRetriever` interface, so a LangChain chain and the harness are
 * ranking with one implementation rather than two that drift.
 *
 * The document `metadata` carries the citation and the score, because the
 * grounding step downstream needs to know which passage a quote came from and
 * a bare `pageContent` cannot tell it.
 */
export interface VerityRetrieverInput extends BaseRetrieverInput {
  embedQuery: QueryEmbedder;
  mode?: RetrievalMode;
  topK?: number;
  framework?: string;
}

export class VerityRetriever extends BaseRetriever {
  static lc_name() {
    return "VerityRetriever";
  }

  lc_namespace = ["verity", "retrievers"];

  private readonly embedQuery: QueryEmbedder;
  private readonly mode: RetrievalMode;
  private readonly topK: number;
  private readonly framework?: string;

  constructor(input: VerityRetrieverInput) {
    super(input);
    this.embedQuery = input.embedQuery;
    this.mode = input.mode ?? "dense";
    this.topK = input.topK ?? 4;
    this.framework = input.framework;
  }

  async _getRelevantDocuments(query: string): Promise<Document[]> {
    const store = await getRetrievalStore();
    const result = await store.search(query, this.embedQuery, {
      mode: this.mode,
      topK: this.topK,
      framework: this.framework,
    });

    return result.results.map(
      (hit) =>
        new Document({
          pageContent: hit.chunk.text,
          metadata: {
            id: hit.chunk.id,
            citation: hit.chunk.citation,
            heading: hit.chunk.heading,
            framework: hit.chunk.framework,
            sourceUrl: hit.chunk.sourceUrl,
            rank: hit.rank,
            score: hit.score,
          },
        })
    );
  }
}

/** The passage block a prompt sees, numbered so the model can refer to one. */
export function formatPassages(docs: Document[]): string {
  return docs
    .map(
      (doc, i) =>
        `[${i + 1}] ${doc.metadata.citation} — ${doc.metadata.heading}\n${doc.pageContent}`
    )
    .join("\n\n");
}
