/**
 * Does the Postgres path return what the in-process index returns?
 *
 *   npx tsx --env-file=.env.local eval/pgvector-parity.mts
 *
 * The application answers from a flat vector scan and Postgres holds the same
 * corpus as the scale-out path. "Populated" is a claim about a table; this is
 * the measurement that turns it into a claim about retrieval — that a corpus
 * which outgrew the lambda could be served from pgvector without the evaluation
 * numbers quietly changing underneath.
 *
 * Two things are expected to differ slightly and both are reported rather than
 * smoothed over:
 *
 *   HNSW is approximate. It trades recall for speed by design, so a
 *   disagreement at depth is the index working, not a bug.
 *
 *   Postgres computes cosine distance in float64 over a float32 column while
 *   the in-process scan accumulates a dot product in float64 over the same
 *   floats. The scores agree to several decimal places, not exactly.
 */
import { readFile } from "node:fs/promises";

import postgres from "postgres";

import { RetrievalStore } from "../src/lib/retrieval/store";
import { EmbeddingCache } from "../src/lib/retrieval/embedding-cache";
import { AI_CONFIG } from "../src/lib/ai/config";

const K = 10;

interface GoldQuery {
  id: string;
  query: string;
  difficulty: string;
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const store = await RetrievalStore.load("data");

  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from corpus_chunks`;
  if (count !== store.meta.chunkCount) {
    throw new Error(
      `Postgres holds ${count} chunks and the shipped index holds ${store.meta.chunkCount}. Run: npm run corpus:push`
    );
  }

  const cache = new EmbeddingCache(
    ".embedding-cache/eval-queries.json",
    AI_CONFIG.embeddings.model,
    AI_CONFIG.embeddings.dimensions
  );
  await cache.load();

  let embedService: { generateQueryEmbedding(q: string): Promise<number[]> } | null = null;
  const embedQuery = async (q: string): Promise<number[]> => {
    const hit = cache.get(q);
    if (hit) return hit;
    if (!embedService) {
      const { getGeminiEmbeddingService } = await import("../src/lib/ai/gemini-embeddings");
      embedService = getGeminiEmbeddingService();
    }
    const vector = await embedService.generateQueryEmbedding(q);
    cache.set(q, vector);
    await cache.flush();
    return vector;
  };

  const queries: GoldQuery[] = (await readFile("eval/gold-set.jsonl", "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GoldQuery);

  console.log(`${count} chunks in Postgres, ${store.meta.chunkCount} in the shipped index`);
  console.log(`Comparing top-${K} over ${queries.length} gold queries\n`);

  let exactOrder = 0;
  let sameSet = 0;
  let overlapTotal = 0;
  let rank1Same = 0;
  let maxScoreDelta = 0;
  const disagreements: string[] = [];

  for (const q of queries) {
    const vector = await embedQuery(q.query);

    const local = (await store.search(q.query, embedQuery, { mode: "dense", topK: K })).results;
    const remote = await sql<{ id: string; score: number }[]>`
      select id, 1 - (embedding <=> ${`[${vector.join(",")}]`}::vector) as score
      from corpus_chunks
      order by embedding <=> ${`[${vector.join(",")}]`}::vector
      limit ${K}
    `;

    const localIds = local.map((r) => r.chunk.id);
    const remoteIds = remote.map((r) => r.id);

    if (localIds.join("|") === remoteIds.join("|")) exactOrder++;
    if (new Set(localIds).size === new Set([...localIds, ...remoteIds]).size) sameSet++;
    if (localIds[0] === remoteIds[0]) rank1Same++;

    const overlap = localIds.filter((id) => remoteIds.includes(id)).length;
    overlapTotal += overlap / K;

    for (let i = 0; i < Math.min(local.length, remote.length); i++) {
      if (local[i].chunk.id === remote[i].id) {
        maxScoreDelta = Math.max(maxScoreDelta, Math.abs(local[i].score - Number(remote[i].score)));
      }
    }

    if (overlap < K && disagreements.length < 5) {
      disagreements.push(`${q.id}: ${overlap}/${K} shared`);
    }
  }

  const n = queries.length;
  const pct = (v: number) => `${((v / n) * 100).toFixed(1)}%`;

  console.log(`rank-1 identical:      ${pct(rank1Same)}`);
  console.log(`same set of ${K}:        ${pct(sameSet)}`);
  console.log(`identical order:       ${pct(exactOrder)}`);
  console.log(`mean overlap@${K}:      ${((overlapTotal / n) * 100).toFixed(1)}%`);
  console.log(`largest score delta:   ${maxScoreDelta.toExponential(2)}`);

  if (disagreements.length > 0) {
    console.log(`\nqueries where the two disagreed:`);
    for (const d of disagreements) console.log(`  ${d}`);
    console.log(
      `\nHNSW is approximate, so some disagreement at depth is the index doing its job.`
    );
  } else {
    console.log(`\nEvery query returned the same ${K} chunks from both paths.`);
  }
} catch (error) {
  console.error("\nfailed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
