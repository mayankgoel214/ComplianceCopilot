import { readFile } from "node:fs/promises";

import { getRetrievalStore } from "@/lib/retrieval/store";
import { ButtonLink, Card, Citation, Section, Stat } from "@/components/ui";

export const revalidate = 3600;

interface EvalResults {
  gold: { total: number; dev: number; test: number };
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

const STEPS = [
  {
    title: "Classify",
    body: "One call decides which of eight frameworks the document actually touches, and must say what in the document triggered each one — so a wrong answer is visible rather than merely plausible.",
  },
  {
    title: "Decompose",
    body: "The same call emits short concerns: the specific things in this document that might create an obligation. Those become the retrieval queries. Embedding a whole document as one vector retrieves nothing in particular.",
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
    <div className="mx-auto max-w-6xl px-5 py-16 sm:py-24 space-y-20 sm:space-y-28">
      <section className="max-w-3xl animate-rise">
        <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-accent mb-5">
          Retrieval-augmented compliance assessment
        </p>
        <h1 className="text-[42px] sm:text-[64px] leading-[1.03]">
          Compliance findings
          <br />
          you can check.
        </h1>
        <p className="text-[17px] sm:text-[19px] text-fg-muted leading-relaxed mt-7 max-w-2xl">
          Verity reads a research or academic document, works out which regulatory frameworks it
          touches, retrieves the sections that actually apply, and reports what is missing —
          quoting the regulation behind every finding.
        </p>
        <p className="text-[15px] text-fg-muted leading-relaxed mt-5 max-w-2xl">
          The step that matters is the last one. Every quote the model produces is checked against
          the passage it was shown before it reaches you. A finding whose citation cannot be found
          is labelled <span className="text-unsupported font-medium">unsupported</span> and excluded
          from the score, rather than printed in the same typeface as a real one.
        </p>

        <div className="flex flex-wrap gap-3 mt-9">
          <ButtonLink href="/assess">Run an assessment</ButtonLink>
          <ButtonLink href="/search" variant="secondary">
            Try the retrieval playground
          </ButtonLink>
        </div>
        <p className="text-[13px] text-fg-faint mt-4">
          No account, nothing to install. Rate limited, because it spends real money on a real
          model.
        </p>
      </section>

      <Section
        title="What is in the index"
        description={
          <>
            {store.meta.frameworks.join(" · ")}. SOC 2 and ISO/IEC 27001 are classified but not
            retrieved against — their text is copyrighted and cannot be redistributed here, and
            Verity says so rather than paraphrasing them.
          </>
        }
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat value={String(store.meta.sectionCount)} label="sections of regulation text" />
          <Stat value={store.meta.chunkCount.toLocaleString()} label="retrievable passages" />
          <Stat value={String(store.meta.frameworks.length)} label="frameworks with a corpus" />
          <Stat
            value={`${store.meta.dimensions}d`}
            label="embedding dimensions"
            hint={store.meta.embeddingModel}
          />
        </div>
      </Section>

      {evaluation && best ? (
        <Section
          title="Retrieval quality, measured"
          description={
            <>
              Six configurations compared on the same labelled set, with the one tunable parameter
              fitted on the development slice alone. The full report includes the configurations
              that lost, and why.
            </>
          }
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat
              accent
              value={`${(best.test.recallAt["10"] * 100).toFixed(1)}%`}
              label="Recall@10, held out"
              hint={`${best.test.n} queries · ${best.name}`}
            />
            <Stat value={best.test.mrr.toFixed(3)} label="MRR@10, held out" />
            <Stat value={best.test.ndcg.toFixed(3)} label="nDCG@10, held out" />
            <Stat
              value={String(evaluation.gold.total)}
              label="labelled queries"
              hint={`${evaluation.gold.dev} dev · ${evaluation.gold.test} test`}
            />
          </div>
          <ButtonLink href="/evaluation" variant="ghost" size="sm" className="-ml-3">
            Read the full evaluation →
          </ButtonLink>
        </Section>
      ) : null}

      <Section title="How a run works">
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Each step is an <li>, because an <ol> may only contain list items
              — the Cards were direct children and axe was right to say so. */}
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Card className="p-5 h-full" interactive>
                <div className="flex items-baseline gap-3">
                  <Citation className="tabular-nums">{String(i + 1).padStart(2, "0")}</Citation>
                  <h3 className="font-medium text-[15px]">{step.title}</h3>
                </div>
                <p className="text-[13px] text-fg-muted leading-relaxed mt-3">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Section>
    </div>
  );
}
