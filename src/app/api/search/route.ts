import { NextResponse } from "next/server";
import { z } from "zod";

import { getRetrievalStore } from "@/lib/retrieval/store";
import { rerank } from "@/lib/retrieval/rerank";
import { getGeminiEmbeddingService } from "@/lib/ai/gemini-embeddings";
import { Trace } from "@/lib/telemetry/trace";
import { AI_CONFIG } from "@/lib/ai/config";
import { toPublicFailure } from "@/lib/errors/public-error";
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

    // Embedded once, up front, and reused across the arms that need it.
    // Charging the comparison three embeddings for one query would make the
    // latency figures this page reports meaningless.
    //
    // Up front rather than lazily because the answer changes what this endpoint
    // can offer. BM25 needs no embedding at all, so when the embedding service
    // is unavailable there is still a real lexical index here to search — and a
    // page that says "dense retrieval is unavailable, these are BM25 results"
    // is honest, where one that quietly returns three arms computed from a
    // stand-in vector is the exact failure this project exists to argue
    // against. So: degrade, name the degradation, and never fake a vector.
    let cachedVector: number[] | null = null;
    let degraded: { reason: string; message: string } | null = null;

    try {
      cachedVector = await trace.record("embed:query", "embed", async () => ({
        value: await embeddings.generateQueryEmbedding(body.query),
        model: AI_CONFIG.embeddings.model,
        inputTokens: null,
        outputTokens: null,
      }));
    } catch (error) {
      const failure = toPublicFailure(error, "search:embed");
      degraded = { reason: failure.kind, message: failure.message };
    }

    const embedQuery = async (): Promise<number[]> => {
      if (!cachedVector) {
        // Unreachable: no dense arm is constructed without a vector. Throwing
        // rather than returning zeros keeps that guarantee enforced instead of
        // assumed.
        throw new Error("A dense arm was run without a query embedding.");
      }
      return cachedVector;
    };

    const framework = body.framework && body.framework !== "all" ? body.framework : undefined;

    const bm25 = await store.search(body.query, embedQuery, { mode: "bm25", topK, framework });

    const [dense, hybrid] = cachedVector
      ? await Promise.all([
          store.search(body.query, embedQuery, { mode: "dense", topK, framework }),
          store.search(body.query, embedQuery, {
            mode: "hybrid",
            topK,
            framework,
            weights: { dense: 1, lexical: 1 },
          }),
        ])
      : [null, null];

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
      ...(dense ? [shape("Dense", dense)] : []),
      shape("BM25", bm25),
      ...(hybrid ? [shape("Hybrid RRF", hybrid)] : []),
    ];

    // Reranking is a generation call, so it is unavailable for the same reason
    // the embedding was.
    if (body.withRerank && rerankAllowed && cachedVector) {
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
      degraded: degraded ?? undefined,
    });
  } catch (error) {
    const failure = toPublicFailure(error, "search");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
