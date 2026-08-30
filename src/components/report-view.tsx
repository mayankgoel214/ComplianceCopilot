import { Badge, Card, Citation, Quote, Section } from "@/components/ui";

/**
 * The rendering of an assessment.
 *
 * Presentational and free of directives on purpose, so the same component
 * serves both callers: the assessment page renders it on the client as a run
 * finishes, and a saved report renders it on the server from a stored row. Two
 * implementations would drift, and the one that drifted would be the shared
 * link — the copy a reader is most likely to be looking at without the author
 * present.
 */

type Verdict = "exact" | "near" | "unsupported";

interface Grounding {
  verdict: Verdict;
  similarity: number;
}

export interface Finding {
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

export interface FrameworkAssessment {
  framework: string;
  confidence: number;
  rationale: string;
  concerns: string[];
  hasCorpus: boolean;
  score: number | null;
  passages: Array<{ citation: string; heading: string; sourceUrl: string; rank: number }>;
  findings: Finding[];
}

export interface ReportResult {
  documentSummary: string;
  frameworks: FrameworkAssessment[];
  grounding: {
    totalFindings: number;
    supported: number;
    unsupported: number;
    groundedRate: number;
  };
  index: { chunkCount: number; sectionCount: number; embeddingModel: string; dimensions: number };
  trace: {
    totalMs: number;
    spans: Array<{
      name: string;
      kind: string;
      durationMs: number;
      inputTokens: number | null;
      outputTokens: number | null;
    }>;
    totals: {
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number | null;
      unpricedEmbeddingCalls: number;
      cachedSpans: number;
    };
  };
}

/**
 * Severity borrows the verdict palette rather than introducing a fourth set of
 * colours: critical and high read as unsupported-red, medium as near-amber, low
 * as neutral. A page has room for one colour language.
 */
const SEVERITY_TONE: Record<Finding["severity"], "unsupported" | "near" | "neutral"> = {
  critical: "unsupported",
  high: "unsupported",
  medium: "near",
  low: "neutral",
};

/** A score's colour reflects how much was found wrong, not how pretty it looks. */
function scoreTone(score: number): string {
  if (score >= 85) return "text-verified";
  if (score >= 60) return "text-near";
  return "text-unsupported";
}

export function GroundingSummary({ grounding }: { grounding: ReportResult["grounding"] }) {
  return (
    <Card className="p-5 space-y-2">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.14em] text-fg-faint">
        Citation grounding
      </h2>
      {grounding.totalFindings === 0 ? (
        <p className="text-sm text-fg-muted">
          No findings were produced, so there was nothing to verify.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed">
            <span className="tabular-nums font-medium text-fg">
              {grounding.supported} of {grounding.totalFindings}
            </span>{" "}
            findings quoted regulation text that was actually found in the passages the model was
            shown ({Math.round(grounding.groundedRate * 100)}%).
          </p>
          <p className="text-[13px] text-fg-muted leading-relaxed">
            {grounding.unsupported > 0
              ? `The other ${grounding.unsupported} cited text that could not be located. Those are marked below and excluded from every score.`
              : "Nothing was cited that could not be located."}
          </p>
        </>
      )}
    </Card>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <Card
      className={`p-5 space-y-3.5 ${
        finding.supported
          ? ""
          : "border-[color-mix(in_srgb,var(--unsupported)_40%,transparent)] bg-[var(--unsupported-soft)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
        <Badge>{finding.status}</Badge>
        <Badge tone={finding.grounding.regulation.verdict}>
          citation {finding.grounding.regulation.verdict}
        </Badge>
        <Citation className="ml-auto">{finding.citation}</Citation>
      </div>

      <h3 className="font-medium leading-snug">{finding.requirement}</h3>
      <p className="text-[13.5px] text-fg-muted leading-relaxed">{finding.explanation}</p>

      {finding.documentQuote ? (
        <Quote
          tone={finding.grounding.document?.verdict ?? "neutral"}
          source={
            <>
              from the submitted document —{" "}
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
            <Citation>{finding.citation}</Citation> — {finding.grounding.regulation.verdict} match
            {finding.grounding.regulation.verdict === "near"
              ? ` (${Math.round(finding.grounding.regulation.similarity * 100)}% overlap)`
              : ""}
          </>
        }
      >
        “{finding.regulationQuote}”
      </Quote>

      {!finding.supported ? (
        <p className="text-xs text-unsupported leading-relaxed">
          This quote was not found in any passage the model was shown, so this finding is excluded
          from the score. It is left visible on purpose.
        </p>
      ) : null}
    </Card>
  );
}

export function FrameworkSection({ assessment }: { assessment: FrameworkAssessment }) {
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2.5">
        <h2 className="text-xl font-semibold tracking-tight">{assessment.framework}</h2>
        {assessment.score !== null ? (
          <span className={`text-lg tabular-nums font-semibold ${scoreTone(assessment.score)}`}>
            {assessment.score}
            <span className="text-fg-faint text-sm font-normal">/100</span>
          </span>
        ) : null}
        <Citation className="ml-auto">
          confidence {Math.round(assessment.confidence * 100)}%
        </Citation>
      </div>

      <p className="text-sm text-fg-muted leading-relaxed">{assessment.rationale}</p>

      {!assessment.hasCorpus ? (
        <Card className="border-[color-mix(in_srgb,var(--near)_40%,transparent)] bg-[var(--near-soft)] p-4">
          <p className="text-[13.5px] leading-relaxed">
            Detected, but its text is copyrighted and is not in the corpus, so there is nothing to
            cite. No findings and no score are produced for it — rather than paraphrasing a standard
            Verity is not allowed to redistribute.
          </p>
        </Card>
      ) : null}

      {assessment.concerns.length > 0 ? (
        <p className="text-[12px] text-fg-faint leading-relaxed">
          <span className="uppercase tracking-[0.1em]">Retrieved for: </span>
          {assessment.concerns.join(" · ")}
        </p>
      ) : null}

      {assessment.findings.map((finding, i) => (
        <FindingCard key={`${assessment.framework}-${i}`} finding={finding} />
      ))}

      {assessment.hasCorpus && assessment.findings.length === 0 ? (
        <p className="text-sm text-fg-muted">
          No findings against the {assessment.passages.length} passages retrieved.
        </p>
      ) : null}
    </section>
  );
}

export function TraceTable({ trace }: { trace: ReportResult["trace"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-fg-faint">
          <tr className="text-left">
            <th className="py-1.5 pr-4 font-medium">Stage</th>
            <th className="py-1.5 pr-4 font-medium">Kind</th>
            <th className="py-1.5 pr-4 font-medium text-right">ms</th>
            <th className="py-1.5 pr-4 font-medium text-right">in</th>
            <th className="py-1.5 font-medium text-right">out</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {trace.spans.map((span, i) => (
            <tr key={`${span.name}-${i}`} className="border-t border-line">
              <td className="py-1.5 pr-4 font-mono text-[11px]">{span.name}</td>
              <td className="py-1.5 pr-4 text-fg-faint">{span.kind}</td>
              <td className="py-1.5 pr-4 text-right">{span.durationMs}</td>
              <td className="py-1.5 pr-4 text-right">{span.inputTokens ?? "—"}</td>
              <td className="py-1.5 text-right">{span.outputTokens ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ReportBody({ result }: { result: ReportResult }) {
  return (
    <div className="space-y-8">
      <Section title="What it read">
        <p className="text-sm leading-relaxed">{result.documentSummary}</p>
      </Section>

      <GroundingSummary grounding={result.grounding} />

      {result.frameworks.length === 0 ? (
        <p className="text-sm text-fg-muted">
          The classifier found no applicable framework in this document. That is a result, not an
          error — nothing was invented to fill the page.
        </p>
      ) : null}

      {result.frameworks.map((framework) => (
        <FrameworkSection key={framework.framework} assessment={framework} />
      ))}
    </div>
  );
}
