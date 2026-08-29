"use client";

import { useState } from "react";

import {
  Badge,
  Button,
  buttonClass,
  Card,
  Citation,
  ErrorNote,
  Quote,
  Skeleton,
} from "@/components/ui";

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

type StageStatus = "start" | "done";

interface StageEvent {
  type: "stage";
  stage: string;
  label: string;
  status: StageStatus;
}

type StreamEvent =
  | StageEvent
  | { type: "meta"; usedSample: boolean; runsRemainingThisHour: number }
  | { type: "classified"; documentSummary: string; frameworks: string[] }
  | { type: "framework"; assessment: FrameworkAssessment }
  | { type: "done"; result: AssessResponse }
  | { type: "error"; message: string };

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

/**
 * Severity maps onto the verdict palette rather than introducing a fourth set
 * of colours: critical and high read as unsupported-red, medium as near-amber,
 * low as neutral. A page has room for one colour language, and this one already
 * means something here.
 */
const SEVERITY_TONE: Record<Finding["severity"], "unsupported" | "near" | "neutral"> = {
  critical: "unsupported",
  high: "unsupported",
  medium: "near",
  low: "neutral",
};

export default function AssessClient({ sampleDocument, sampleDescription }: AssessClientProps) {
  const [document, setDocument] = useState("");
  const [usingSample, setUsingSample] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AssessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [partial, setPartial] = useState<FrameworkAssessment[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ filename: string; note: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setUpload(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/extract", { method: "POST", body: form });
      const body = (await response.json()) as {
        text?: string;
        chars?: number;
        originalChars?: number;
        truncated?: boolean;
        kind?: string;
        pages?: number;
        warnings?: string[];
        error?: string;
      };
      if (!response.ok || !body.text) {
        setError(body.error ?? `Could not read that file (${response.status}).`);
        return;
      }
      setDocument(body.text);
      setUsingSample(false);
      setData(null);
      setStages([]);

      // Says what was actually extracted, so a reader can tell a full document
      // from a truncated one before spending a run on it.
      const parts = [
        body.kind === "pdf" && body.pages ? `${body.pages} pages` : null,
        `${body.chars?.toLocaleString()} characters`,
        body.truncated
          ? `truncated from ${body.originalChars?.toLocaleString()} — only the first part will be assessed`
          : null,
        ...(body.warnings ?? []).slice(0, 2),
      ].filter(Boolean);
      setUpload({ filename: file.name, note: parts.join(" · ") });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function loadSample() {
    setDocument(sampleDocument);
    setUsingSample(true);
    setUpload(null);
    setData(null);
    setError(null);
    setStages([]);
  }

  async function run(useSample: boolean) {
    setLoading(true);
    setError(null);
    setData(null);
    setStages([]);
    setPartial([]);
    setSummary(null);

    try {
      const response = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useSample ? { useSample: true } : { document }),
      });

      // A refusal — bad input, or the rate limit — arrives as ordinary JSON
      // before the stream opens.
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Request failed with ${response.status}.`);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // NDJSON: one event per line. A chunk can split a line anywhere, so the
      // tail is carried over rather than parsed.
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          apply(event);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setLoading(false);
    }
  }

  function apply(event: StreamEvent) {
    switch (event.type) {
      case "stage":
        setStages((prev) => {
          const next = prev.filter((s) => s.stage !== event.stage);
          return [...next, event].sort((a, b) => a.stage.localeCompare(b.stage));
        });
        break;
      case "classified":
        setSummary(event.documentSummary);
        break;
      case "framework":
        setPartial((prev) => [...prev, event.assessment]);
        break;
      case "done":
        setData(event.result);
        break;
      case "error":
        setError(event.message);
        break;
      default:
        break;
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
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`relative rounded-lg transition-colors ${
            dragging ? "ring-2 ring-accent ring-offset-2 ring-offset-bg" : ""
          }`}
        >
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
        {dragging ? (
          <div className="absolute inset-0 rounded-lg bg-[var(--accent-soft)] grid place-items-center pointer-events-none">
            <span className="text-sm font-medium text-accent">Drop to read the file</span>
          </div>
        ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void run(false)} disabled={loading || document.trim().length < 200}>
            {loading ? "Running…" : "Assess this document"}
          </Button>
          <Button onClick={loadSample} disabled={loading} variant="secondary">
            Load the sample document
          </Button>
          <label className={buttonClass("secondary")} data-testid="upload-label">
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
              className="sr-only"
              disabled={loading || uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                // Cleared so choosing the same file twice still fires a change.
                e.target.value = "";
              }}
            />
            {uploading ? "Reading…" : "Upload a file"}
          </label>
          <span className="text-xs text-fg-muted">
            {document.trim().length > 0 && document.trim().length < 200
              ? `${200 - document.trim().length} more characters needed`
              : "Three runs per visitor per hour"}
          </span>
        </div>

        {upload ? (
          <p className="text-xs text-fg-muted">
            <span className="text-fg">{upload.filename}</span> — {upload.note}
          </p>
        ) : null}

        {usingSample && document === sampleDocument ? (
          <p className="text-xs text-fg-muted">
            Sample loaded. Its stated context: {sampleDescription.replace(/\s+/g, " ")}
          </p>
        ) : null}
      </div>

      {/*
        Live progress, not a spinner. The pipeline streams a start and a done
        event per stage, so this is the actual state of the run rather than an
        animation standing in for one — and the stages are the interesting part
        of what the tool does.
      */}
      {loading || (stages.length > 0 && !data) ? (
        <Card className="px-5 py-5 space-y-4" role="status" aria-live="polite">
          <ol className="space-y-2.5">
            {stages.map((stage) => {
              const done = stage.status === "done";
              return (
                <li key={stage.stage} className="flex items-center gap-3 text-sm">
                  <span
                    className={`h-4 w-4 shrink-0 rounded-full grid place-items-center border ${
                      done
                        ? "border-verified bg-[var(--verified-soft)]"
                        : "border-accent animate-pulse-soft"
                    }`}
                    aria-hidden
                  >
                    {done ? (
                      <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none">
                        <path
                          d="M5 12.5l4.5 4.5L19 7.5"
                          stroke="var(--verified)"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </span>
                  <span className={done ? "text-fg-muted" : "text-fg"}>{stage.label}</span>
                </li>
              );
            })}
          </ol>

          {summary ? (
            <p className="text-[13px] text-fg-muted leading-relaxed border-t border-line pt-4">
              {summary}
            </p>
          ) : (
            <div className="space-y-2.5 border-t border-line pt-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-full" />
            </div>
          )}

          {partial.length > 0 ? (
            <p className="text-[12px] text-fg-faint">
              {partial.length} of {stages.length - 1} frameworks assessed
            </p>
          ) : null}
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
                    <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
                    <Badge>{finding.status}</Badge>
                    <Badge tone={finding.grounding.regulation.verdict}>
                      citation {finding.grounding.regulation.verdict}
                    </Badge>
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
