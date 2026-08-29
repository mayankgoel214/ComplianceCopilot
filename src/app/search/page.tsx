"use client";

import { useState } from "react";

import { Button, Card, Citation, EmptyState, ErrorNote } from "@/components/ui";

/**
 * The retrieval playground.
 *
 * One query, every configuration, side by side. The point is that a visitor can
 * disagree with the evaluation: the report says dense retrieval beats fusion on
 * this corpus, and this page is where you go to find the query where it does
 * not.
 */

const FRAMEWORKS = [
  "all",
  "FERPA",
  "HIPAA",
  "GDPR",
  "IRB",
  "ADA/Section 508",
  "Export Controls (EAR/ITAR)",
];

const EXAMPLES = [
  "A laptop with 900 patient files was stolen from a car. What do we now owe, and to whom?",
  "Our signup form has a pre-ticked box for marketing email. Is that a problem?",
  "45 CFR 164.312",
  "A visiting scholar from abroad will be working in a lab that builds sensor prototypes.",
  "Can we analyse an existing de-identified dataset without going to the full board?",
];

interface Hit {
  rank: number;
  score: number;
  id: string;
  citation: string;
  heading: string;
  framework: string;
  sourceUrl: string;
  text: string;
  provenance?: { denseRank?: number; bm25Rank?: number };
}

interface Arm {
  label: string;
  timings: Record<string, number | undefined>;
  results: Hit[];
}

interface SearchResponse {
  query: string;
  arms: Arm[];
  rerankRefused?: string;
  index: {
    chunkCount: number;
    sectionCount: number;
    embeddingModel: string;
    dimensions: number;
    vocabularySize: number;
  };
  searchesRemainingThisHour: number;
  error?: string;
}

function timingLabel(arm: Arm): string {
  const parts: string[] = [];
  if (arm.timings.embedMs !== undefined) parts.push(`embed ${arm.timings.embedMs}ms`);
  if (arm.timings.denseMs !== undefined) parts.push(`dense ${arm.timings.denseMs}ms`);
  if (arm.timings.bm25Ms !== undefined) parts.push(`bm25 ${arm.timings.bm25Ms}ms`);
  if (arm.timings.fuseMs !== undefined) parts.push(`fuse ${arm.timings.fuseMs}ms`);
  if (arm.timings.rerankMs !== undefined) parts.push(`rerank ${arm.timings.rerankMs}ms`);
  return parts.join(" · ") || "—";
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [framework, setFramework] = useState("all");
  const [withRerank, setWithRerank] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function run(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setError("Type a question first.");
      return;
    }
    setLoading(true);
    setError(null);
    // The previous results deliberately stay on screen. Clearing them here left
    // the page blank for as long as the request took — twelve seconds with the
    // reranker on — which reads as a broken page rather than a slow one.
    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, framework, withRerank }),
      });
      const body = (await response.json()) as SearchResponse;
      if (!response.ok) {
        setError(body.error ?? `Request failed with ${response.status}.`);
        return;
      }
      setExpanded(null);
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-10 space-y-8">
      <header className="space-y-3 max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Retrieval playground</h1>
        <p className="text-fg-muted leading-relaxed">
          One query, ranked three ways at once — dense vectors, BM25, and the two fused by
          reciprocal rank fusion. Ask something a compliance officer would ask, then try pasting a
          bare section number and watch which arm survives.
        </p>
      </header>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="How quickly must we report a breach to the regulator?"
            aria-label="Search query"
            className="flex-1 h-10 rounded-md border border-line bg-surface px-3.5 text-sm outline-none transition-colors focus:border-accent placeholder:text-fg-faint"
          />
          <select
            value={framework}
            onChange={(e) => setFramework(e.target.value)}
            aria-label="Framework filter"
            className="h-10 rounded-md border border-line bg-surface px-3 text-sm outline-none transition-colors focus:border-accent"
          >
            {FRAMEWORKS.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "All frameworks" : f}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </Button>
        </div>

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={withRerank}
            onChange={(e) => setWithRerank(e.target.checked)}
            className="rounded border-line"
          />
          Add the LLM reranker (slower, and the only arm that costs a generation call)
        </label>

        <div className="flex flex-wrap gap-2 pt-1">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => {
                setQuery(example);
                void run(example);
              }}
              className="text-[12px] rounded-full border border-line px-3 py-1.5 text-fg-muted hover:text-fg hover:border-line-strong hover:bg-surface-2 transition-colors text-left"
            >
              {example.length > 62 ? `${example.slice(0, 62)}…` : example}
            </button>
          ))}
        </div>
      </form>

      {error ? (
        <ErrorNote title="That search did not run." detail={error} />
      ) : null}

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-fg-muted"
        >
          {withRerank
            ? "Embedding the query, running both arms, then asking the model to rank the fused candidates. The rerank pass is the slow one — around ten seconds."
            : "Embedding the query and running all three arms."}
        </div>
      ) : null}

      {data ? (
        <div className={loading ? "opacity-40 transition-opacity" : "transition-opacity"}>
          <p className="text-xs text-fg-muted">
            {data.index.chunkCount} passages · {data.index.dimensions}d {data.index.embeddingModel} ·
            BM25 vocabulary {data.index.vocabularySize} · {data.searchesRemainingThisHour} searches
            left this hour
          </p>
          {data.rerankRefused ? (
            <p className="text-sm text-near mt-2">{data.rerankRefused}</p>
          ) : null}

          {/*
            The column count follows the number of arms. A fixed three-column
            grid stranded the reranked arm alone on a second row whenever it was
            switched on, which read as a rendering fault rather than as a fourth
            result.
          */}
          <div
            className={`grid gap-4 items-start mt-4 sm:grid-cols-2 ${
              data.arms.length >= 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"
            }`}
          >
            {data.arms.map((arm) => (
              <Card key={arm.label} className="overflow-hidden p-0">
                <header className="px-4 py-3 border-b border-line">
                  <h2 className="font-medium text-sm">{arm.label}</h2>
                  <p className="text-xs text-fg-muted mt-0.5 tabular-nums">
                    {timingLabel(arm)}
                  </p>
                </header>
                {arm.results.length === 0 ? (
                  <div className="p-4">
                    <EmptyState
                      title="Nothing matched"
                      description="For BM25 that means none of the query terms appear anywhere in the corpus — exactly the failure mode dense retrieval does not have."
                    />
                  </div>
                ) : (
                  <ol className="divide-y divide-line">
                    {arm.results.map((hit) => {
                      const key = `${arm.label}:${hit.id}`;
                      const isOpen = expanded === key;
                      return (
                        <li key={key} className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setExpanded(isOpen ? null : key)}
                            className="w-full text-left group"
                            aria-expanded={isOpen}
                          >
                            <div className="flex gap-2 items-baseline">
                              <span className="text-xs tabular-nums text-fg-muted shrink-0 w-5">
                                {hit.rank}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate group-hover:text-fg">
                                  {hit.heading}
                                </div>
                                <Citation className="block mt-1 truncate">
                                  {hit.citation}
                                </Citation>
                              </div>
                              <span className="font-mono text-[11.5px] tabular-nums text-fg-faint shrink-0">
                                {hit.score.toFixed(3)}
                              </span>
                            </div>
                          </button>
                          {hit.provenance &&
                          (hit.provenance.denseRank || hit.provenance.bm25Rank) ? (
                            <p className="text-[11px] text-fg-muted mt-1 pl-7">
                              dense {hit.provenance.denseRank ?? "—"} · bm25{" "}
                              {hit.provenance.bm25Rank ?? "—"}
                            </p>
                          ) : null}
                          {isOpen ? (
                            <div className="mt-2 pl-7 space-y-2">
                              <p className="text-xs leading-relaxed text-fg-muted whitespace-pre-wrap">
                                {hit.text}
                              </p>
                              <a
                                href={hit.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs underline underline-offset-4 hover:text-fg"
                              >
                                Read the source
                              </a>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
