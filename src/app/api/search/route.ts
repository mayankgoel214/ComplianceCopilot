import { NextResponse } from "next/server";
import { z } from "zod";

import { getRetrievalStore } from "@/lib/retrieval/store";
import { rerank } from "@/lib/retrieval/rerank";
import { getGeminiEmbeddingService } from "@/lib/ai/gemini-embeddings";
import { Trace } from "@/lib/telemetry/trace";
import { AI_CONFIG } from "@/lib/ai/config";
import {
  RERANK_BUCKET,
  SEARCH_BUCKET,
  checkRateLimit,
  visitorKeyFrom,
} from "@/lib/demo/rate-limit";

/**
 * The retrieval playground.
 *
 * Runs one query through every configuration at once and returns all of them,
 * so a visitor can see the same query ranked four ways rather than being told
 * which one is better. The reranked arm is optional because it is the only one
 * that costs a generation call, and it is metered against its own bucket.
 */
export const maxDuration = 60;

const RERANK_CANDIDATES = 30;

const BodySchema = z.object({
  query: z.string().min(2).max(500),
  framework: z.string().max(64).optional(),
  withRerank: z.boolean().optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")
            : "Request body was not valid JSON.",
      },
      { status: 400 }
    );
  }

  const visitor = visitorKeyFrom(request.headers);
  const limit = checkRateLimit(visitor, SEARCH_BUCKET);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429 }
    );
  }

  let rerankAllowed = false;
  let rerankRefusal: string | undefined;
  if (body.withRerank) {
    const rerankLimit = checkRateLimit(visitor, RERANK_BUCKET);
    rerankAllowed = rerankLimit.allowed;
    rerankRefusal = rerankLimit.reason;
  }

  const topK = body.topK ?? 8;

  try {
    const store = await getRetrievalStore();
    const trace = new Trace();
    const embeddings = getGeminiEmbeddingService();

    // Embedded once and reused across the arms that need it. Charging the
    // comparison three embeddings for one query would make the latency figures
    // this page reports meaningless.
    let cachedVector: number[] | null = null;
    const embedQuery = async (query: string): Promise<number[]> => {
      if (cachedVector) return cachedVector;
      cachedVector = await trace.record("embed:query", "embed", async () => ({
        value: await embeddings.generateQueryEmbedding(query),
        model: AI_CONFIG.embeddings.model,
        inputTokens: null,
        outputTokens: null,
      }));
      return cachedVector;
    };

    const framework = body.framework && body.framework !== "all" ? body.framework : undefined;

    const [dense, bm25, hybrid] = await Promise.all([
      store.search(body.query, embedQuery, { mode: "dense", topK, framework }),
      store.search(body.query, embedQuery, { mode: "bm25", topK, framework }),
      store.search(body.query, embedQuery, {
        mode: "hybrid",
        topK,
        framework,
        weights: { dense: 1, lexical: 1 },
      }),
    ]);

    const shape = (label: string, result: Awaited<ReturnType<typeof store.search>>) => ({
      label,
      timings: result.timings,
      results: result.results.map((r) => ({
        rank: r.rank,
        score: r.score,
        id: r.chunk.id,
        citation: r.chunk.citation,
        heading: r.chunk.heading,
        framework: r.chunk.framework,
        sourceUrl: r.chunk.sourceUrl,
        text: r.chunk.text,
        provenance: result.provenance?.[r.chunk.id],
      })),
    });

    const arms = [
      shape("Dense", dense),
      shape("BM25", bm25),
      shape("Hybrid RRF", hybrid),
    ];

    if (body.withRerank && rerankAllowed) {
      const started = Date.now();
      const candidates = await store.candidatesForRerank(
        body.query,
        embedQuery,
        RERANK_CANDIDATES,
        framework
      );
      const reranked = await rerank(body.query, candidates.results, { topK, trace, seed: 7 });
      arms.push({
        label: "Hybrid + rerank",
        timings: { ...candidates.timings, rerankMs: Date.now() - started, totalMs: Date.now() - started },
        results: reranked.map((r) => ({
          rank: r.rank,
          score: r.score,
          id: r.chunk.id,
          citation: r.chunk.citation,
          heading: r.chunk.heading,
          framework: r.chunk.framework,
          sourceUrl: r.chunk.sourceUrl,
          text: r.chunk.text,
          provenance: undefined,
        })),
      });
    }

    return NextResponse.json({
      query: body.query,
      arms,
      rerankRefused: body.withRerank && !rerankAllowed ? rerankRefusal : undefined,
      trace: trace.summary(),
      index: {
        chunkCount: store.meta.chunkCount,
        sectionCount: store.meta.sectionCount,
        embeddingModel: store.meta.embeddingModel,
        dimensions: store.meta.dimensions,
        vocabularySize: store.vocabularySize,
      },
      searchesRemainingThisHour: limit.remaining,
    });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message.slice(0, 400) : "The search failed." },
      { status: 502 }
    );
  }
}
