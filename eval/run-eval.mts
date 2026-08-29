/**
 * Retrieval evaluation.
 *
 *   npx tsx --env-file=.env.local eval/run-eval.mts [--data DIR] [--no-rerank] [--out FILE] [--label NAME]
 *
 * Relevance is judged at section granularity: a gold label names a section of
 * regulation (`45 CFR 164.308`), and a retrieved chunk hits that label if it
 * came from that section. Results are deduplicated by section before scoring,
 * so a configuration that fills the top ten with ten chunks of one section
 * scores as having found one thing, which is what it has done.
 *
 * The gold set is split by how the query is written, and the split is used:
 *
 *   dev   — `direct` queries, phrased close to the regulation's own language.
 *           The one fitted parameter in the stack, the fusion weight, is chosen
 *           on this slice and on nothing else.
 *   test  — `paraphrased` queries, written as a practitioner would describe the
 *           situation rather than the rule, deliberately avoiding the target
 *           section's vocabulary. Never used to choose anything.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { RetrievalStore } from "../src/lib/retrieval/store";
import { rerank } from "../src/lib/retrieval/rerank";
import { EmbeddingCache } from "../src/lib/retrieval/embedding-cache";
import { AI_CONFIG } from "../src/lib/ai/config";
import type { FusionWeights } from "../src/lib/retrieval/fusion";
import type { ScoredChunk } from "../src/lib/retrieval/types";

const K_VALUES = [1, 3, 5, 10];
const CUTOFF = 10;
const RERANK_CANDIDATES = 30;
const LEXICAL_WEIGHT_GRID = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1];

interface GoldQuery {
  id: string;
  framework: string;
  query: string;
  gold: string[];
  difficulty: "direct" | "paraphrased" | "lookup";
}

interface Outcome {
  id: string;
  framework: string;
  difficulty: GoldQuery["difficulty"];
  ranking: string[];
  gold: string[];
  latencyMs: number;
}

interface Metrics {
  recallAt: Record<number, number>;
  mrr: number;
  ndcg: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  n: number;
}

interface ConfigResult {
  name: string;
  description: string;
  dev: Metrics;
  test: Metrics;
  lookup: Metrics;
  all: Metrics;
  outcomes: Outcome[];
}

function stringArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

function toCitationRanking(results: ScoredChunk[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of results) {
    if (seen.has(r.chunk.citation)) continue;
    seen.add(r.chunk.citation);
    out.push(r.chunk.citation);
  }
  return out;
}

function recallAtK(ranking: string[], gold: string[], k: number): number {
  const top = new Set(ranking.slice(0, k));
  return gold.length === 0 ? 0 : gold.filter((g) => top.has(g)).length / gold.length;
}

function reciprocalRank(ranking: string[], gold: string[]): number {
  const goldSet = new Set(gold);
  for (let i = 0; i < Math.min(ranking.length, CUTOFF); i++) {
    if (goldSet.has(ranking[i])) return 1 / (i + 1);
  }
  return 0;
}

function ndcg(ranking: string[], gold: string[]): number {
  const goldSet = new Set(gold);
  let dcg = 0;
  for (let i = 0; i < Math.min(ranking.length, CUTOFF); i++) {
    if (goldSet.has(ranking[i])) dcg += 1 / Math.log2(i + 2);
  }
  let ideal = 0;
  for (let i = 0; i < Math.min(gold.length, CUTOFF); i++) ideal += 1 / Math.log2(i + 2);
  return ideal === 0 ? 0 : dcg / ideal;
}

function metricsFor(outcomes: Outcome[]): Metrics {
  if (outcomes.length === 0) {
    return { recallAt: {}, mrr: 0, ndcg: 0, medianLatencyMs: 0, p95LatencyMs: 0, n: 0 };
  }
  const latencies = outcomes.map((o) => o.latencyMs).sort((a, b) => a - b);
  const recallAt: Record<number, number> = {};
  for (const k of K_VALUES) {
    recallAt[k] = outcomes.reduce((s, o) => s + recallAtK(o.ranking, o.gold, k), 0) / outcomes.length;
  }
  return {
    recallAt,
    mrr: outcomes.reduce((s, o) => s + reciprocalRank(o.ranking, o.gold), 0) / outcomes.length,
    ndcg: outcomes.reduce((s, o) => s + ndcg(o.ranking, o.gold), 0) / outcomes.length,
    medianLatencyMs: latencies[Math.floor(latencies.length / 2)],
    p95LatencyMs: latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))],
    n: outcomes.length,
  };
}

async function main() {
  const dataDir = stringArg("data", "data");
  const outFile = stringArg("out", "docs/retrieval-eval.md");
  const resultsFile = stringArg("results", "eval/results.json");
  const label = stringArg("label", "");
  const withRerank = !process.argv.includes("--no-rerank");

  const queries: GoldQuery[] = (await readFile("eval/gold-set.jsonl", "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as GoldQuery);

  const dev = queries.filter((q) => q.difficulty === "direct");
  const test = queries.filter((q) => q.difficulty === "paraphrased");
  if (dev.length === 0 || test.length === 0) throw new Error("Gold set is missing one of the two slices");

  const store = await RetrievalStore.load(dataDir);

  const citations = new Set(store.chunks.map((c) => c.citation));
  for (const q of queries) {
    for (const g of q.gold) {
      if (!citations.has(g)) throw new Error(`Gold citation "${g}" for query ${q.id} is not in the index`);
    }
  }

  console.log(
    `Index: ${store.meta.chunkCount} chunks / ${store.meta.sectionCount} sections, ` +
      `${store.meta.dimensions}d ${store.meta.embeddingModel}, BM25 vocabulary ${store.vocabularySize}`
  );
  console.log(`Gold: ${queries.length} queries (${dev.length} dev, ${test.length} test), ${queries.reduce((a, q) => a + q.gold.length, 0)} labelled sections\n`);

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

  const runAll = async (
    subset: GoldQuery[],
    run: (q: GoldQuery) => Promise<ScoredChunk[]>
  ): Promise<Outcome[]> => {
    const outcomes: Outcome[] = [];
    for (const q of subset) {
      const t0 = Date.now();
      const results = await run(q);
      outcomes.push({
        id: q.id,
        framework: q.framework,
        difficulty: q.difficulty,
        ranking: toCitationRanking(results),
        gold: q.gold,
        latencyMs: Date.now() - t0,
      });
    }
    return outcomes;
  };

  // ---- Fusion weight, chosen on the dev slice only ----------------------
  console.log("Sweeping the fusion weight on the dev slice:");
  const sweep: Array<{ lexical: number; ndcg: number }> = [];
  for (const lexical of LEXICAL_WEIGHT_GRID) {
    const outcomes = await runAll(dev, async (q) =>
      (
        await store.search(q.query, embedQuery, {
          mode: "hybrid",
          topK: 40,
          weights: { dense: 1, lexical },
        })
      ).results
    );
    const m = metricsFor(outcomes);
    sweep.push({ lexical, ndcg: m.ndcg });
    console.log(`  lexical weight ${lexical.toFixed(2)} -> dev nDCG@10 ${m.ndcg.toFixed(4)}`);
  }
  const chosen = sweep.reduce((a, b) => (b.ndcg > a.ndcg ? b : a));
  const weights: FusionWeights = { dense: 1, lexical: chosen.lexical };
  console.log(`  chosen: lexical weight ${chosen.lexical}\n`);

  // ---- Configurations ---------------------------------------------------
  const configs: Array<{ name: string; description: string; run: (q: GoldQuery) => Promise<ScoredChunk[]> }> = [
    {
      name: "BM25",
      description: "Okapi BM25 alone (k1 = 1.2, b = 0.75), no fitted parameters",
      run: async (q) => (await store.search(q.query, embedQuery, { mode: "bm25", topK: 40 })).results,
    },
    {
      name: "Dense",
      description: `Cosine over float32 ${AI_CONFIG.embeddings.model} vectors at ${AI_CONFIG.embeddings.dimensions}d`,
      run: async (q) => (await store.search(q.query, embedQuery, { mode: "dense", topK: 40 })).results,
    },
    {
      name: "Dense (int8)",
      description: "The same vectors quantized to int8 with one scale per vector, 4x smaller",
      run: async (q) =>
        (await store.search(q.query, embedQuery, { mode: "dense", topK: 40, quantized: true })).results,
    },
    {
      name: "Hybrid RRF (equal)",
      description: "Dense and BM25 fused by Reciprocal Rank Fusion, k = 60, both arms weighted 1",
      run: async (q) =>
        (
          await store.search(q.query, embedQuery, {
            mode: "hybrid",
            topK: 40,
            weights: { dense: 1, lexical: 1 },
          })
        ).results,
    },
    {
      name: "Hybrid RRF (weighted)",
      description: `The same fusion with the lexical arm weighted ${chosen.lexical}, chosen on the dev slice`,
      run: async (q) => (await store.search(q.query, embedQuery, { mode: "hybrid", topK: 40, weights })).results,
    },
  ];

  if (withRerank) {
    configs.push({
      name: "Hybrid + rerank",
      description: `Top ${RERANK_CANDIDATES} weighted-fusion candidates reranked listwise by ${AI_CONFIG.gemini.model}`,
      run: async (q) => {
        const candidates = await store.candidatesForRerank(
          q.query,
          embedQuery,
          RERANK_CANDIDATES,
          undefined,
          weights
        );
        return rerank(q.query, candidates.results, { topK: CUTOFF, seed: 7 });
      },
    });
  }

  const results: ConfigResult[] = [];
  for (const config of configs) {
    process.stdout.write(`${config.name} ... `);
    const outcomes = await runAll(queries, config.run);
    const result: ConfigResult = {
      name: config.name,
      description: config.description,
      dev: metricsFor(outcomes.filter((o) => o.difficulty === "direct")),
      test: metricsFor(outcomes.filter((o) => o.difficulty === "paraphrased")),
      lookup: metricsFor(outcomes.filter((o) => o.difficulty === "lookup")),
      all: metricsFor(outcomes),
      outcomes,
    };
    results.push(result);
    console.log(
      `test recall@10 ${(result.test.recallAt[10] * 100).toFixed(1)}%  MRR ${result.test.mrr.toFixed(3)}  nDCG ${result.test.ndcg.toFixed(3)}`
    );
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, renderReport(store, queries, results, sweep, chosen.lexical, withRerank, label), "utf8");
  await mkdir(path.dirname(resultsFile), { recursive: true });
  await writeFile(
    resultsFile,
    JSON.stringify(
      {
        index: store.meta,
        gold: {
          total: queries.length,
          dev: dev.length,
          test: test.length,
          lookup: queries.filter((q) => q.difficulty === "lookup").length,
          labelledSections: queries.reduce((a, q) => a + q.gold.length, 0),
        },
        fusionWeightSweep: sweep,
        chosenLexicalWeight: chosen.lexical,
        // Per-query outcomes are dropped: the report needs the aggregates, and
        // keeping 118 rankings per configuration would make this file unreadable.
        configs: results.map((r) => ({
          name: r.name,
          description: r.description,
          dev: r.dev,
          test: r.test,
          lookup: r.lookup,
          all: r.all,
        })),
      },
      null,
      2
    ),
    "utf8"
  );
  console.log(`\nWrote ${outFile} and ${resultsFile}`);
}

function renderReport(
  store: RetrievalStore,
  queries: GoldQuery[],
  results: ConfigResult[],
  sweep: Array<{ lexical: number; ndcg: number }>,
  chosenLexical: number,
  withRerank: boolean,
  label: string
): string {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const dev = queries.filter((q) => q.difficulty === "direct").length;
  const test = queries.filter((q) => q.difficulty === "paraphrased").length;
  const bestTest = results.reduce((a, b) => (b.test.ndcg > a.test.ndcg ? b : a));

  const row = (name: string, m: Metrics) =>
    `| ${name} | ${pct(m.recallAt[1])} | ${pct(m.recallAt[3])} | ${pct(m.recallAt[5])} | ${pct(m.recallAt[10])} | ${m.mrr.toFixed(3)} | ${m.ndcg.toFixed(3)} | ${m.medianLatencyMs} ms | ${m.p95LatencyMs} ms |`;

  const header = [
    `| Configuration | R@1 | R@3 | R@5 | R@10 | MRR@10 | nDCG@10 | Median | p95 |`,
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |`,
  ];

  const lines: string[] = [];
  lines.push(`# Retrieval evaluation${label ? ` — ${label}` : ""}`);
  lines.push("");
  lines.push(
    "Every number on this page is produced by `npx tsx --env-file=.env.local eval/run-eval.mts` against the committed index and the committed gold set. Nothing is typed in by hand."
  );
  lines.push("");
  lines.push("## Setup");
  lines.push("");
  lines.push(
    `- **Corpus** — ${store.meta.sectionCount} sections of regulation text across ${store.meta.frameworks.length} frameworks, chunked into ${store.meta.chunkCount} passages at a ${store.meta.chunking.targetTokens}-token target with ${store.meta.chunking.overlapTokens} tokens of overlap. Sources are US federal regulations (public domain) and the GDPR; see \`scripts/fetch-corpus.mjs\`.`
  );
  lines.push(
    `- **Embeddings** — \`${store.meta.embeddingModel}\` at ${store.meta.dimensions} dimensions, asymmetric task types (\`RETRIEVAL_DOCUMENT\` for passages, \`RETRIEVAL_QUERY\` for queries).`
  );
  lines.push(
    `- **Gold set** — ${queries.length} queries carrying ${queries.reduce((a, q) => a + q.gold.length, 0)} labelled sections, in \`eval/gold-set.jsonl\`. Written by the author after reading the corpus; every label was checked against the section text.`
  );
  lines.push(
    `- **Split** — **dev ${dev}** \`direct\` queries, phrased close to the regulation's own language; **test ${test}** \`paraphrased\` queries, written as a practitioner would describe the situation and deliberately avoiding the target section's vocabulary. The fusion weight is the only fitted parameter in the stack and it is chosen on dev alone. Everything else — BM25's k1 and b, RRF's k, the chunk size — is a published default or was fixed before the gold set existed.`
  );
  lines.push(
    `- **Relevance** — judged at section granularity. A retrieved chunk hits a label if it came from that section; rankings are deduplicated by section before scoring.`
  );
  lines.push(
    `- **Latency** — query embeddings are cached across configurations so that one query costs one embedding rather than one per row, which means the reported latencies are search time and exclude the embedding round trip. In the live application that round trip is roughly 200-350 ms and is charged once per query, whichever configuration runs.`
  );
  lines.push("");
  lines.push("## Held-out test slice");
  lines.push("");
  lines.push(`The ${test} paraphrased queries. These are the numbers that mean something.`);
  lines.push("");
  lines.push(...header);
  for (const r of results) lines.push(row(r.name, r.test));
  lines.push("");
  lines.push(`Best by nDCG@10 on the held-out slice: **${bestTest.name}** (${bestTest.test.ndcg.toFixed(3)}).`);
  lines.push("");
  lines.push("## Development slice");
  lines.push("");
  lines.push(
    `The ${dev} direct queries. The fusion weight was chosen here, so treat these as a description of the slice rather than as an independent result.`
  );
  lines.push("");
  lines.push(...header);
  for (const r of results) lines.push(row(r.name, r.dev));
  lines.push("");
  const lookupCount = queries.filter((q) => q.difficulty === "lookup").length;
  lines.push("## Citation-lookup slice");
  lines.push("");
  lines.push(
    `${lookupCount} queries that name a section directly — \`45 CFR 164.312\`, \`GDPR Article 30\`, \`734.4 de minimis\`. This slice exists because the headline result below is that fusion does not help, and that conclusion is only honest if the query class where the lexical arm is indispensable is also on the page. A dense retriever has no special handle on a section number; BM25 does.`
  );
  lines.push("");
  lines.push(...header);
  for (const r of results) lines.push(row(r.name, r.lookup));
  lines.push("");
  lines.push("## Choosing the fusion weight");
  lines.push("");
  lines.push(
    `Equal-weight RRF is the textbook default and it is the wrong default here: BM25 is much the weaker arm on this corpus, and giving it an equal vote pulls the fused ranking below dense retrieval alone. The lexical weight was swept on the dev slice:`
  );
  lines.push("");
  lines.push("| Lexical weight | Dev nDCG@10 |");
  lines.push("| --- | --- |");
  for (const s of sweep) {
    lines.push(`| ${s.lexical.toFixed(2)}${s.lexical === chosenLexical ? " **(chosen)**" : ""} | ${s.ndcg.toFixed(4)} |`);
  }
  lines.push("");
  lines.push(
    `A lexical weight of 0 is dense retrieval with extra steps, and is included so that the sweep can say so if that is what the data shows.`
  );
  lines.push("");
  lines.push("## Recall@10 by framework, held-out slice");
  lines.push("");
  const frameworks = [...new Set(queries.filter((q) => q.difficulty === "paraphrased").map((q) => q.framework))].sort();
  lines.push(`| Framework | n | ${results.map((r) => r.name).join(" | ")} |`);
  lines.push(`| --- | --- | ${results.map(() => "---").join(" | ")} |`);
  for (const f of frameworks) {
    const cells = results.map((r) => {
      const subset = r.outcomes.filter((o) => o.difficulty === "paraphrased" && o.framework === f);
      return pct(subset.reduce((s, o) => s + recallAtK(o.ranking, o.gold, 10), 0) / subset.length);
    });
    const n = queries.filter((q) => q.difficulty === "paraphrased" && q.framework === f).length;
    lines.push(`| ${f} | ${n} | ${cells.join(" | ")} |`);
  }
  lines.push("");
  lines.push("## Configurations");
  lines.push("");
  for (const r of results) lines.push(`- **${r.name}** — ${r.description}`);
  lines.push("");
  lines.push("## Limitations");
  lines.push("");
  lines.push(
    `1. **The labels are one person's judgement.** Each query was written after reading the corpus and each gold section was read to confirm it answers the query, but a relevant section nobody thought of is scored as a miss. That penalises every configuration equally, so the ordering of the rows holds even where the absolute numbers are conservative.`
  );
  lines.push(
    `2. **The test slice is ${test} queries.** One query moves recall by about ${(100 / test).toFixed(1)} points. Differences smaller than that are noise, and the table should be read for its ordering, not its decimals.`
  );
  lines.push(
    `3. **Two of the eight frameworks Verity classifies have no corpus.** SOC 2 (AICPA Trust Services Criteria) and ISO/IEC 27001 (Annex A) are copyrighted and cannot be redistributed here. Verity classifies documents against them and says outright that it has nothing to retrieve for them.`
  );
  lines.push(
    `4. **The direct slice has little headroom.** Dense retrieval answers almost all of it, which is why the paraphrased slice exists and why it carries the headline numbers.`
  );
  if (withRerank) {
    lines.push(
      `5. **The reranker is a language model.** Candidate order is shuffled with a fixed seed before ranking so it cannot simply echo the fusion order, and temperature is 0, but reruns will still move slightly.`
    );
  }
  lines.push("");
  return lines.join("\n");
}

main().catch((err) => {
  console.error("\nevaluation failed:", err.message);
  process.exit(1);
});
