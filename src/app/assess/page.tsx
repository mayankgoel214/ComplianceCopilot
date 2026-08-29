"use client";

import { useState } from "react";

/**
 * The assessment page.
 *
 * Shows the grounding verdict on every finding, not just the findings. A tool
 * that quietly hides the claims it could not verify is indistinguishable, from
 * the outside, from one that never checked.
 */

const SAMPLE_LABEL = "the sample data management plan";

interface Grounding {
  verdict: "exact" | "near" | "unsupported";
  similarity: number;
}

interface Finding {
  requirement: string;
  status: "met" | "partial" | "missing" | "unclear";
  severity: "critical" | "high" | "medium" | "low";
  explanation: string;
  documentQuote: string;
  regulationQuote: string;
  citation: string;
  supported: boolean;
  grounding: { regulation: Grounding; document: Grounding | null };
}

interface FrameworkAssessment {
  framework: string;
  confidence: number;
  rationale: string;
  concerns: string[];
  hasCorpus: boolean;
  score: number | null;
  passages: Array<{ citation: string; heading: string; sourceUrl: string; rank: number }>;
  findings: Finding[];
}

interface Span {
  name: string;
  kind: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}

interface AssessResponse {
  documentSummary: string;
  frameworks: FrameworkAssessment[];
  grounding: { totalFindings: number; supported: number; unsupported: number; groundedRate: number };
  index: { chunkCount: number; sectionCount: number; embeddingModel: string; dimensions: number };
  trace: {
    totalMs: number;
    spans: Span[];
    totals: {
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number | null;
      unpricedEmbeddingCalls: number;
      cachedSpans: number;
    };
  };
  usedSample: boolean;
  runsRemainingThisHour: number;
  error?: string;
}

const SEVERITY_STYLE: Record<Finding["severity"], string> = {
  critical: "border-red-500/50 text-red-400",
  high: "border-orange-500/50 text-orange-400",
  medium: "border-amber-500/50 text-amber-400",
  low: "border-sky-500/50 text-sky-400",
};

const VERDICT_STYLE: Record<Grounding["verdict"], string> = {
  exact: "border-emerald-500/50 text-emerald-400",
  near: "border-amber-500/50 text-amber-400",
  unsupported: "border-red-500/60 text-red-400",
};

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wide ${className}`}
    >
      {children}
    </span>
  );
}

export default function AssessPage() {
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  async function run(useSample: boolean) {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const response = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useSample ? { useSample: true } : { document }),
      });
      const body = (await response.json()) as AssessResponse;
      if (!response.ok) {
        setError(body.error ?? `Request failed with ${response.status}.`);
        return;
      }
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Assess a document</h1>
        <p className="text-muted-foreground leading-relaxed">
          Paste a data management plan, IRB protocol, or privacy policy — or run {SAMPLE_LABEL},
          which is written to contain findable problems so you can check the output against the
          input. Takes 30 to 90 seconds; it makes several model calls.
        </p>
      </header>

      <div className="space-y-3">
        <textarea
          value={document}
          onChange={(e) => setDocument(e.target.value)}
          rows={10}
          placeholder="Paste a document here, or just run the sample below."
          aria-label="Document to assess"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono leading-relaxed outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => void run(false)}
            disabled={loading || document.trim().length < 200}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"
          >
            {loading ? "Running…" : "Assess this document"}
          </button>
          <button
            onClick={() => void run(true)}
            disabled={loading}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted/60 disabled:opacity-40"
          >
            Run {SAMPLE_LABEL}
          </button>
          <span className="text-xs text-muted-foreground">
            {document.trim().length > 0 && document.trim().length < 200
              ? `${200 - document.trim().length} more characters needed`
              : "Three runs per visitor per hour"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-border/60 bg-card/30 px-4 py-6 text-sm text-muted-foreground">
          Classifying, retrieving regulation text, assessing, then verifying every quote against its
          source. This is a real pipeline, so it takes real time.
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm space-y-1"
        >
          <p className="font-medium">The assessment did not complete.</p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {data ? (
        <div className="space-y-8">
          <section className="rounded-lg border border-border/60 bg-card/30 p-4 space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              What it read
            </h2>
            <p className="text-sm leading-relaxed">{data.documentSummary}</p>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground tabular-nums pt-1">
              <span>{(data.trace.totalMs / 1000).toFixed(1)}s total</span>
              <span>
                {data.trace.totals.inputTokens.toLocaleString()} in /{" "}
                {data.trace.totals.outputTokens.toLocaleString()} out tokens
              </span>
              <span>
                {data.trace.totals.estimatedCostUsd !== null
                  ? `$${data.trace.totals.estimatedCostUsd.toFixed(4)} in generation at published rates`
                  : "generation cost not attributable — a call reported no usage"}
                {data.trace.totals.unpricedEmbeddingCalls > 0
                  ? `, plus ${data.trace.totals.unpricedEmbeddingCalls} embedding calls the API does not meter`
                  : ""}
              </span>
              <span>{data.runsRemainingThisHour} runs left this hour</span>
            </div>
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
              aria-expanded={showTrace}
            >
              {showTrace ? "Hide" : "Show"} the per-stage trace
            </button>
            {showTrace ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs mt-2">
                  <thead className="text-muted-foreground">
                    <tr className="text-left">
                      <th className="py-1 pr-4 font-medium">Stage</th>
                      <th className="py-1 pr-4 font-medium">Kind</th>
                      <th className="py-1 pr-4 font-medium text-right">ms</th>
                      <th className="py-1 pr-4 font-medium text-right">in</th>
                      <th className="py-1 font-medium text-right">out</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {data.trace.spans.map((span, i) => (
                      <tr key={`${span.name}-${i}`} className="border-t border-border/40">
                        <td className="py-1 pr-4 font-mono">{span.name}</td>
                        <td className="py-1 pr-4 text-muted-foreground">{span.kind}</td>
                        <td className="py-1 pr-4 text-right">{span.durationMs}</td>
                        <td className="py-1 pr-4 text-right">{span.inputTokens ?? "—"}</td>
                        <td className="py-1 text-right">{span.outputTokens ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-border/60 bg-card/30 p-4 space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Citation grounding
            </h2>
            <p className="text-sm leading-relaxed">
              {data.grounding.totalFindings === 0 ? (
                "No findings were produced, so there was nothing to verify."
              ) : (
                <>
                  <span className="tabular-nums font-medium">
                    {data.grounding.supported} of {data.grounding.totalFindings}
                  </span>{" "}
                  findings quoted regulation text that was actually found in the passages the model
                  was shown ({(data.grounding.groundedRate * 100).toFixed(0)}%).
                  {data.grounding.unsupported > 0 ? (
                    <>
                      {" "}
                      The other {data.grounding.unsupported} cited text that could not be located —
                      those are marked below and excluded from every score.
                    </>
                  ) : (
                    " Nothing was cited that could not be located."
                  )}
                </>
              )}
            </p>
          </section>

          {data.frameworks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The classifier found no applicable framework in this document. That is a result, not
              an error — nothing was invented to fill the page.
            </p>
          ) : null}

          {data.frameworks.map((framework) => (
            <section key={framework.framework} className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-3 border-b border-border/60 pb-2">
                <h2 className="text-xl font-semibold tracking-tight">{framework.framework}</h2>
                {framework.score !== null ? (
                  <span className="text-lg tabular-nums font-medium">{framework.score}/100</span>
                ) : null}
                <span className="text-xs text-muted-foreground tabular-nums">
                  confidence {(framework.confidence * 100).toFixed(0)}%
                </span>
              </div>

              <p className="text-sm text-muted-foreground leading-relaxed">{framework.rationale}</p>

              {!framework.hasCorpus ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
                  This framework was detected, but its text is copyrighted and is not in the corpus,
                  so there is nothing to cite. No findings and no score are produced for it — rather
                  than paraphrasing a standard Verity is not allowed to redistribute.
                </div>
              ) : null}

              {framework.concerns.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  <span className="uppercase tracking-wider">Retrieved for: </span>
                  {framework.concerns.join(" · ")}
                </div>
              ) : null}

              {framework.findings.map((finding, i) => (
                <article
                  key={`${framework.framework}-${i}`}
                  className={`rounded-lg border p-4 space-y-3 ${
                    finding.supported ? "border-border/60 bg-card/30" : "border-red-500/40 bg-red-500/5"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill className={SEVERITY_STYLE[finding.severity]}>{finding.severity}</Pill>
                    <Pill className="border-border/70 text-muted-foreground">{finding.status}</Pill>
                    <Pill className={VERDICT_STYLE[finding.grounding.regulation.verdict]}>
                      citation {finding.grounding.regulation.verdict}
                    </Pill>
                    <span className="text-xs text-muted-foreground ml-auto">{finding.citation}</span>
                  </div>

                  <h3 className="font-medium leading-snug">{finding.requirement}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {finding.explanation}
                  </p>

                  {finding.documentQuote ? (
                    <blockquote className="border-l-2 border-border pl-3 text-sm">
                      <p className="text-muted-foreground italic">“{finding.documentQuote}”</p>
                      <footer className="text-[11px] text-muted-foreground mt-1">
                        from your document —{" "}
                        {finding.grounding.document
                          ? `${finding.grounding.document.verdict} match`
                          : "not checked"}
                      </footer>
                    </blockquote>
                  ) : null}

                  <blockquote className="border-l-2 border-primary/50 pl-3 text-sm">
                    <p className="text-muted-foreground italic">“{finding.regulationQuote}”</p>
                    <footer className="text-[11px] text-muted-foreground mt-1">
                      {finding.citation} — {finding.grounding.regulation.verdict} match
                      {finding.grounding.regulation.verdict === "near"
                        ? ` (${(finding.grounding.regulation.similarity * 100).toFixed(0)}% overlap)`
                        : ""}
                    </footer>
                  </blockquote>

                  {!finding.supported ? (
                    <p className="text-xs text-red-400">
                      This quote was not found in any passage the model was shown, so this finding
                      is excluded from the score. It is left visible on purpose.
                    </p>
                  ) : null}
                </article>
              ))}

              {framework.hasCorpus && framework.findings.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No findings for this framework against the {framework.passages.length} passages
                  retrieved.
                </p>
              ) : null}
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}
