"use client";

import { useState } from "react";

import { Badge, Button, Card, Citation, ErrorNote, Quote, Skeleton } from "@/components/ui";

/**
 * The assessment page.
 *
 * Shows the grounding verdict on every finding, not just the findings. A tool
 * that quietly hides the claims it could not verify is indistinguishable, from
 * the outside, from one that never checked.
 *
 * The sample document is loaded into the textarea rather than run invisibly.
 * The whole claim of this page is that you can check the findings against the
 * document, and you cannot check them against a document you were never shown.
 */

export interface AssessClientProps {
  sampleDocument: string;
  sampleDescription: string;
}

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
  schemaValidation: { attempts: number; firstPassValid: number; repaired: number; failed: number };
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
  critical: "border-[color-mix(in_srgb,var(--unsupported)_40%,transparent)] text-unsupported",
  high: "border-[color-mix(in_srgb,var(--near)_40%,transparent)] text-near",
  medium: "border-[color-mix(in_srgb,var(--near)_40%,transparent)] text-near",
  low: "border-[color-mix(in_srgb,var(--accent)_35%,transparent)] text-accent",
};

const VERDICT_STYLE: Record<Grounding["verdict"], string> = {
  exact: "border-[color-mix(in_srgb,var(--verified)_35%,transparent)] text-verified",
  near: "border-[color-mix(in_srgb,var(--near)_40%,transparent)] text-near",
  unsupported: "border-[color-mix(in_srgb,var(--unsupported)_40%,transparent)] text-unsupported",
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

export default function AssessClient({ sampleDocument, sampleDescription }: AssessClientProps) {
  const [document, setDocument] = useState("");
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  function loadSample() {
    setDocument(sampleDocument);
    setUsingSample(true);
    setData(null);
    setError(null);
  }

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
        <p className="text-fg-muted leading-relaxed">
          Paste a data management plan, IRB protocol, or privacy policy — or load the sample, which
          is written to contain findable problems. It goes into the box below so you can read it
          first and check every finding against it. A run takes around 30 seconds and makes several
          model calls.
        </p>
      </header>

      <div className="space-y-3">
        <textarea
          value={document}
          onChange={(e) => {
            setDocument(e.target.value);
            setUsingSample(false);
          }}
          rows={12}
          placeholder="Paste a document here, or just run the sample below."
          aria-label="Document to assess"
          className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-[13px] font-mono leading-relaxed outline-none transition-colors focus:border-accent placeholder:text-fg-faint resize-y"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void run(false)} disabled={loading || document.trim().length < 200}>
            {loading ? "Running…" : "Assess this document"}
          </Button>
          <Button onClick={loadSample} disabled={loading} variant="secondary">
            Load the sample document
          </Button>
          <span className="text-xs text-fg-muted">
            {document.trim().length > 0 && document.trim().length < 200
              ? `${200 - document.trim().length} more characters needed`
              : "Three runs per visitor per hour"}
          </span>
        </div>

        {usingSample && document === sampleDocument ? (
          <p className="text-xs text-fg-muted">
            Sample loaded. Its stated context: {sampleDescription.replace(/\s+/g, " ")}
          </p>
        ) : null}
      </div>

      {loading ? (
        <Card className="px-5 py-5 space-y-4">
          <p className="text-sm text-fg-muted">
            Classifying, retrieving regulation text, assessing, then verifying every quote against
            its source. This is a real pipeline, so it takes real time.
          </p>
          <div className="space-y-2.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </Card>
      ) : null}

      {error ? (
        <ErrorNote title="The assessment did not complete." detail={error} />
      ) : null}

      {data ? (
        <div className="space-y-8">
          <section className="rounded-lg border border-line bg-surface p-4 space-y-3">
            <h2 className="text-sm font-medium uppercase tracking-wider text-fg-muted">
              What it read
            </h2>
            <p className="text-sm leading-relaxed">{data.documentSummary}</p>
            <div className="flex flex-wrap gap-4 text-xs text-fg-muted tabular-nums pt-1">
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
            {data.schemaValidation.attempts > 0 ? (
              <p className="text-xs text-fg-muted">
                Structured output: {data.schemaValidation.firstPassValid} of{" "}
                {data.schemaValidation.attempts} model calls satisfied their schema first time,
                {" "}
                {data.schemaValidation.repaired} needed one repair,{" "}
                {data.schemaValidation.failed} failed outright. Counted across this server
                instance, not this run.
              </p>
            ) : null}
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="text-xs underline underline-offset-4 text-fg-muted hover:text-fg"
              aria-expanded={showTrace}
            >
              {showTrace ? "Hide" : "Show"} the per-stage trace
            </button>
            {showTrace ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs mt-2">
                  <thead className="text-fg-muted">
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
                      <tr key={`${span.name}-${i}`} className="border-t border-line">
                        <td className="py-1 pr-4 font-mono">{span.name}</td>
                        <td className="py-1 pr-4 text-fg-muted">{span.kind}</td>
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

          <section className="rounded-lg border border-line bg-surface p-4 space-y-2">
            <h2 className="text-sm font-medium uppercase tracking-wider text-fg-muted">
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
            <p className="text-sm text-fg-muted">
              The classifier found no applicable framework in this document. That is a result, not
              an error — nothing was invented to fill the page.
            </p>
          ) : null}

          {data.frameworks.map((framework) => (
            <section key={framework.framework} className="space-y-4">
              <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2">
                <h2 className="text-xl font-semibold tracking-tight">{framework.framework}</h2>
                {framework.score !== null ? (
                  <span className="text-lg tabular-nums font-medium">{framework.score}/100</span>
                ) : null}
                <span className="text-xs text-fg-muted tabular-nums">
                  confidence {(framework.confidence * 100).toFixed(0)}%
                </span>
              </div>

              <p className="text-sm text-fg-muted leading-relaxed">{framework.rationale}</p>

              {!framework.hasCorpus ? (
                <div className="rounded-md border border-[color-mix(in_srgb,var(--near)_40%,transparent)] bg-[var(--near-soft)] px-4 py-3 text-sm">
                  This framework was detected, but its text is copyrighted and is not in the corpus,
                  so there is nothing to cite. No findings and no score are produced for it — rather
                  than paraphrasing a standard Verity is not allowed to redistribute.
                </div>
              ) : null}

              {framework.concerns.length > 0 ? (
                <div className="text-xs text-fg-muted">
                  <span className="uppercase tracking-wider">Retrieved for: </span>
                  {framework.concerns.join(" · ")}
                </div>
              ) : null}

              {framework.findings.map((finding, i) => (
                <article
                  key={`${framework.framework}-${i}`}
                  className={`rounded-lg border p-4 space-y-3 ${
                    finding.supported ? "border-line bg-surface" : "border-[color-mix(in_srgb,var(--unsupported)_40%,transparent)] bg-[var(--unsupported-soft)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill className={SEVERITY_STYLE[finding.severity]}>{finding.severity}</Pill>
                    <Pill className="border-line text-fg-muted">{finding.status}</Pill>
                    <Pill className={VERDICT_STYLE[finding.grounding.regulation.verdict]}>
                      citation {finding.grounding.regulation.verdict}
                    </Pill>
                    <span className="text-xs text-fg-muted ml-auto">{finding.citation}</span>
                  </div>

                  <h3 className="font-medium leading-snug">{finding.requirement}</h3>
                  <p className="text-sm text-fg-muted leading-relaxed">
                    {finding.explanation}
                  </p>

                  {finding.documentQuote ? (
                    <Quote
                      tone={finding.grounding.document?.verdict ?? "neutral"}
                      source={
                        <>
                          from your document —{" "}
                          {finding.grounding.document
                            ? `${finding.grounding.document.verdict} match`
                            : "not checked"}
                        </>
                      }
                    >
                      “{finding.documentQuote}”
                    </Quote>
                  ) : null}

                  <Quote
                    tone={finding.grounding.regulation.verdict}
                    source={
                      <>
                        <Citation>{finding.citation}</Citation> —{" "}
                        {finding.grounding.regulation.verdict} match
                        {finding.grounding.regulation.verdict === "near"
                          ? ` (${(finding.grounding.regulation.similarity * 100).toFixed(0)}% overlap)`
                          : ""}
                      </>
                    }
                  >
                    “{finding.regulationQuote}”
                  </Quote>

                  {!finding.supported ? (
                    <p className="text-xs text-unsupported">
                      This quote was not found in any passage the model was shown, so this finding
                      is excluded from the score. It is left visible on purpose.
                    </p>
                  ) : null}
                </article>
              ))}

              {framework.hasCorpus && framework.findings.length === 0 ? (
                <p className="text-sm text-fg-muted">
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
