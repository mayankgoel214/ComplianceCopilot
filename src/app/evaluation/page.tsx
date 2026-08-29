import Link from "next/link";
import { readFile } from "node:fs/promises";

/**
 * Renders the evaluation results.
 *
 * Reads `eval/results.json`, which the harness writes. Nothing on this page is
 * a literal — if the harness has not been run, the page says so instead of
 * showing numbers whose provenance nobody can check.
 */
export const revalidate = 3600;

interface Metrics {
  recallAt: Record<string, number>;
  mrr: number;
  ndcg: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  n: number;
}

interface Results {
  index: {
    embeddingModel: string;
    dimensions: number;
    chunking: { targetTokens: number; overlapTokens: number };
    sectionCount: number;
    chunkCount: number;
    frameworks: string[];
  };
  gold: { total: number; dev: number; test: number; lookup?: number; labelledSections: number };
  fusionWeightSweep: Array<{ lexical: number; ndcg: number }>;
  chosenLexicalWeight: number;
  configs: Array<{ name: string; description: string; dev: Metrics; test: Metrics; lookup?: Metrics }>;
}

interface ChunkingSummary {
  slice: string;
  arm: string;
  configs: Array<{
    label: string;
    note: string;
    shipped: boolean;
    chunkCount: number;
    recallAt1: number | null;
    recallAt10: number | null;
    mrr: number | null;
    ndcg: number | null;
  }>;
}

async function loadChunking(): Promise<ChunkingSummary | null> {
  try {
    return JSON.parse(await readFile("eval/chunking-results.json", "utf8")) as ChunkingSummary;
  } catch {
    return null;
  }
}

async function loadResults(): Promise<Results | null> {
  try {
    return JSON.parse(await readFile("eval/results.json", "utf8")) as Results;
  } catch {
    return null;
  }
}

const pct = (v: number | undefined) => (v === undefined ? "—" : `${(v * 100).toFixed(1)}%`);

function MetricsTable({
  configs,
  slice,
}: {
  configs: Results["configs"];
  slice: "dev" | "test" | "lookup";
}) {
  const rows = configs.filter((c) => c[slice] && c[slice]!.n > 0);
  if (rows.length === 0) {
    return <p className="text-sm text-fg-muted">This slice was not measured.</p>;
  }
  const best = rows.reduce((a, b) => (b[slice]!.ndcg > a[slice]!.ndcg ? b : a));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-fg-muted text-xs uppercase tracking-wider">
          <tr className="text-left border-b border-line">
            <th className="py-2 pr-4 font-medium">Configuration</th>
            <th className="py-2 pr-4 font-medium text-right">R@1</th>
            <th className="py-2 pr-4 font-medium text-right">R@3</th>
            <th className="py-2 pr-4 font-medium text-right">R@5</th>
            <th className="py-2 pr-4 font-medium text-right">R@10</th>
            <th className="py-2 pr-4 font-medium text-right">MRR@10</th>
            <th className="py-2 pr-4 font-medium text-right">nDCG@10</th>
            <th className="py-2 font-medium text-right">Median</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((config) => {
            const m = config[slice]!;
            const isBest = config.name === best.name;
            return (
              <tr
                key={config.name}
                className={`border-b border-line ${isBest ? "bg-[var(--verified-soft)]" : ""}`}
              >
                <td className="py-2 pr-4 font-medium">
                  {config.name}
                  {isBest ? <span className="text-verified ml-2 text-xs">best</span> : null}
                </td>
                <td className="py-2 pr-4 text-right">{pct(m.recallAt["1"])}</td>
                <td className="py-2 pr-4 text-right">{pct(m.recallAt["3"])}</td>
                <td className="py-2 pr-4 text-right">{pct(m.recallAt["5"])}</td>
                <td className="py-2 pr-4 text-right">{pct(m.recallAt["10"])}</td>
                <td className="py-2 pr-4 text-right">{m.mrr.toFixed(3)}</td>
                <td className="py-2 pr-4 text-right">{m.ndcg.toFixed(3)}</td>
                <td className="py-2 text-right text-fg-muted">{m.medianLatencyMs} ms</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function EvaluationPage() {
  const results = await loadResults();
  const chunking = await loadChunking();

  if (!results) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-12 space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Evaluation</h1>
        <p className="text-fg-muted">
          The evaluation harness has not been run against this build, so there are no numbers to
          show. Running it is{" "}
          <code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded">
            npx tsx --env-file=.env.local eval/run-eval.mts
          </code>
          .
        </p>
      </div>
    );
  }

  const maxSweep = Math.max(...results.fusionWeightSweep.map((s) => s.ndcg));

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 space-y-12">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Retrieval evaluation</h1>
        <p className="text-fg-muted leading-relaxed">
          {results.gold.total} labelled queries over {results.index.sectionCount} sections of
          regulation text, split into {results.gold.dev} development queries phrased close to the
          regulation&apos;s own language and {results.gold.test} held-out queries written the way a
          practitioner would describe the situation
          {results.gold.lookup ? `, plus ${results.gold.lookup} bare citation lookups` : ""}.
          Relevance is judged at section granularity.
        </p>
        <p className="text-sm text-fg-muted">
          Everything here is generated by the harness in{" "}
          <code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded">eval/run-eval.mts</code> against
          the committed index and the committed gold set. The prose version, with the full method
          and limitations, is in{" "}
          <code className="text-xs bg-surface-2 px-1.5 py-0.5 rounded">docs/retrieval-eval.md</code>.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Held-out slice</h2>
        <p className="text-sm text-fg-muted">
          The {results.gold.test} paraphrased queries, which deliberately avoid the target
          section&apos;s vocabulary. These are the numbers that mean something.
        </p>
        <MetricsTable configs={results.configs} slice="test" />
      </section>

      {results.gold.lookup ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Citation lookups</h2>
          <p className="text-sm text-fg-muted">
            Queries that name a section outright. This slice is here because the headline result is
            that fusion does not help, and that conclusion is only honest if the query class where
            the lexical arm is indispensable is on the page too.
          </p>
          <MetricsTable configs={results.configs} slice="lookup" />
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Development slice</h2>
        <p className="text-sm text-fg-muted">
          The {results.gold.dev} direct queries. The fusion weight was chosen here, so read these as
          a description of the slice rather than an independent result.
        </p>
        <MetricsTable configs={results.configs} slice="dev" />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Choosing the fusion weight</h2>
        <p className="text-sm text-fg-muted leading-relaxed">
          Equal-weight reciprocal rank fusion is the textbook default, and it is the wrong default
          here. BM25 is much the weaker arm on this corpus, and giving it an equal vote drags the
          fused ranking below dense retrieval alone. Swept on the development slice, the best
          lexical weight is {results.chosenLexicalWeight} — which is to say the honest answer is
          that fusion earns nothing here, and the report says so rather than reporting a hybrid
          number that a tuned weight quietly rescued.
        </p>
        <div className="space-y-1.5">
          {results.fusionWeightSweep.map((s) => (
            <div key={s.lexical} className="flex items-center gap-3 text-sm">
              <span className="w-12 tabular-nums text-fg-muted text-right">
                {s.lexical.toFixed(2)}
              </span>
              <div className="flex-1 h-5 bg-surface-2 rounded-sm overflow-hidden">
                <div
                  className={`h-full ${
                    // The winning bar is the solid one. It was the faintest,
                    // which inverted the emphasis the chart exists to carry.
                    s.ndcg === maxSweep ? "bg-verified" : "bg-[color-mix(in_srgb,var(--accent)_45%,transparent)]"
                  }`}
                  style={{ width: `${(s.ndcg / maxSweep) * 100}%` }}
                />
              </div>
              <span className="w-16 tabular-nums text-right">{s.ndcg.toFixed(4)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-fg-muted">
          Lexical weight against development nDCG@10. Bars are scaled to the best value, not to
          zero.
        </p>
      </section>

      {chunking ? (
        <section className="space-y-3">
          <h2 className="text-lg font-medium">Chunk size</h2>
          <p className="text-sm text-fg-muted leading-relaxed">
            Four full rebuilds of the index across a fourfold range of chunk sizes, each evaluated
            by the same harness on the same {chunking.slice} slice. Dense retrieval, reranker off,
            because the reranker sits downstream of what the chunking makes retrievable.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-fg-muted text-xs uppercase tracking-wider">
                <tr className="text-left border-b border-line">
                  <th className="py-2 pr-4 font-medium">Target / overlap</th>
                  <th className="py-2 pr-4 font-medium text-right">Chunks</th>
                  <th className="py-2 pr-4 font-medium text-right">R@1</th>
                  <th className="py-2 pr-4 font-medium text-right">R@10</th>
                  <th className="py-2 pr-4 font-medium text-right">MRR@10</th>
                  <th className="py-2 font-medium text-right">nDCG@10</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {chunking.configs.map((c) => (
                  <tr
                    key={c.label}
                    className={`border-b border-line ${c.shipped ? "bg-[var(--accent-soft)]" : ""}`}
                  >
                    <td className="py-2 pr-4 font-medium">
                      {c.label}
                      {c.shipped ? (
                        <span className="text-accent ml-2 text-xs">shipped</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-4 text-right text-fg-muted">{c.chunkCount}</td>
                    <td className="py-2 pr-4 text-right">{pct(c.recallAt1 ?? undefined)}</td>
                    <td className="py-2 pr-4 text-right">{pct(c.recallAt10 ?? undefined)}</td>
                    <td className="py-2 pr-4 text-right">{c.mrr?.toFixed(3) ?? "—"}</td>
                    <td className="py-2 text-right">{c.ndcg?.toFixed(3) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-fg-muted leading-relaxed">
            The result is a null one, and the shipped configuration is deliberately left alone.
            nDCG@10 moves across a range smaller than {results.gold.test} queries can resolve. What
            does show a shape is a tradeoff rather than a winner: larger chunks put the answer at
            rank 1 more often, smaller ones cover more by rank 10. The nominally best row is not
            adopted, because choosing it on held-out numbers would fit the system to its own test
            set. Chunk size is a knob that gets turned by reflex; on this corpus it is not where the
            quality is — reranking is.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Configurations</h2>
        <dl className="space-y-2 text-sm">
          {results.configs.map((c) => (
            <div key={c.name}>
              <dt className="font-medium">{c.name}</dt>
              <dd className="text-fg-muted">{c.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">What this does not prove</h2>
        <ul className="space-y-2 text-sm text-fg-muted list-disc pl-5 leading-relaxed">
          <li>
            The labels are one person&apos;s judgement. Every query was written after reading the
            corpus and every gold section was read to confirm it answers the query, but a relevant
            section nobody thought of counts as a miss. That penalises every configuration equally,
            so the ordering of the rows survives even where the absolute numbers are conservative.
          </li>
          <li>
            The held-out slice is {results.gold.test} queries. One query moves recall by about{" "}
            {(100 / results.gold.test).toFixed(1)} points, so differences smaller than that are
            noise. Read the table for its ordering, not its decimals.
          </li>
          <li>
            Two of the eight frameworks Verity classifies have no corpus at all. SOC 2 and ISO/IEC
            27001 are copyrighted and cannot be redistributed here.
          </li>
          <li>
            The reranker is a language model. Candidate order is shuffled with a fixed seed so it
            cannot simply echo the fusion order, and temperature is zero, but reruns still move.
          </li>
        </ul>
        <p className="text-sm">
          <Link href="/search" className="underline underline-offset-4">
            Disagree with it in the playground
          </Link>{" "}
          — the same configurations, on whatever query you like.
        </p>
      </section>
    </div>
  );
}
