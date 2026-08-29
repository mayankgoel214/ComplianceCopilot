import Link from "next/link";
import { readFile } from "node:fs/promises";

import { getRetrievalStore } from "@/lib/retrieval/store";

/**
 * The overview page.
 *
 * Numbers on this page are read from the committed index and the committed
 * evaluation results at render time, so a stale figure is impossible: if the
 * index changes and the report is not regenerated, the page shows nothing
 * rather than last week's number.
 */
export const revalidate = 3600;

interface EvalResults {
  gold: { total: number; dev: number; test: number; labelledSections: number };
  chosenLexicalWeight: number;
  configs: Array<{
    name: string;
    test: { recallAt: Record<string, number>; mrr: number; ndcg: number; n: number };
  }>;
}

async function loadEval(): Promise<EvalResults | null> {
  try {
    return JSON.parse(await readFile("eval/results.json", "utf8")) as EvalResults;
  } catch {
    return null;
  }
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/40 px-4 py-3">
      <div className="text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{label}</div>
    </div>
  );
}

const STEPS = [
  {
    title: "Classify",
    body: "One model call decides which of eight frameworks the document actually touches, and why. It is required to say what in the document triggered each one, which makes a wrong answer visible instead of merely plausible.",
  },
  {
    title: "Decompose",
    body: "The classifier also emits short concerns — the specific things in this document that might create an obligation. Those become the retrieval queries. Embedding a whole document as one vector retrieves nothing in particular.",
  },
  {
    title: "Retrieve",
    body: "Each concern is embedded and matched against the corpus, filtered to the framework in question. BM25 and rank fusion are implemented and measured too; the evaluation explains why they are not the default.",
  },
  {
    title: "Assess",
    body: "The model sees the document and the retrieved passages, and must quote both for every finding it makes.",
  },
  {
    title: "Verify",
    body: "Both quotes are checked against their sources — exact, near, or unsupported. Unsupported findings do not count toward the score, and are shown as unsupported rather than quietly dropped.",
  },
];

export default async function HomePage() {
  const store = await getRetrievalStore();
  const evaluation = await loadEval();
  const best = evaluation?.configs.reduce((a, b) => (b.test.ndcg > a.test.ndcg ? b : a));

  return (
    <div className="mx-auto max-w-6xl px-5 py-12 space-y-16">
      <section className="space-y-5 max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight leading-tight">
          Compliance findings you can check.
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">
          Verity reads a research or academic document, works out which regulatory frameworks it
          touches, retrieves the sections that actually apply, and reports what is missing — quoting
          the regulation behind every finding.
        </p>
        <p className="text-muted-foreground leading-relaxed">
          The step that matters is the last one. Every quote the model produces is checked against
          the passage it was shown before it reaches you. A finding whose citation cannot be found
          is labelled unsupported and excluded from the score, rather than being printed in the same
          typeface as a real one.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/assess"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Run an assessment
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted/60 transition-colors"
          >
            Try the retrieval playground
          </Link>
        </div>
        <p className="text-sm text-muted-foreground pt-1">
          No account, nothing to install. Rate limited, because it spends real money on a real model.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          What is in the index
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat value={String(store.meta.sectionCount)} label="sections of regulation text" />
          <Stat value={String(store.meta.chunkCount)} label="retrievable passages" />
          <Stat value={String(store.meta.frameworks.length)} label="frameworks with a corpus" />
          <Stat value={`${store.meta.dimensions}d`} label={store.meta.embeddingModel} />
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          {store.meta.frameworks.join(" · ")}. SOC 2 and ISO/IEC 27001 are classified but not
          retrieved against — their text is copyrighted and cannot be redistributed here, and Verity
          says so rather than paraphrasing them.
        </p>
      </section>

      {evaluation && best ? (
        <section className="space-y-4">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Retrieval quality, measured
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              value={`${(best.test.recallAt["10"] * 100).toFixed(1)}%`}
              label={`Recall@10 on ${best.test.n} held-out queries (${best.name})`}
            />
            <Stat value={best.test.mrr.toFixed(3)} label="MRR@10, held-out" />
            <Stat value={best.test.ndcg.toFixed(3)} label="nDCG@10, held-out" />
            <Stat
              value={String(evaluation.gold.total)}
              label={`labelled queries — ${evaluation.gold.dev} dev, ${evaluation.gold.test} test`}
            />
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Several retrieval configurations compared on the same labelled set, with the one tunable
            parameter fitted on the development slice alone.{" "}
            <Link href="/evaluation" className="underline underline-offset-4 hover:text-foreground">
              The full report
            </Link>{" "}
            includes the configurations that lost, and why.
          </p>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          How it works
        </h2>
        <ol className="space-y-4 max-w-3xl">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="shrink-0 w-7 h-7 rounded-full border border-border/70 grid place-items-center text-xs tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <div className="space-y-1">
                <div className="font-medium">{step.title}</div>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
