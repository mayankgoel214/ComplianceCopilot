"use client";

import { useState } from "react";

import { Button, ButtonLink, buttonClass, Card, ErrorNote, Skeleton } from "@/components/ui";
import { ReportBody, TraceTable, type ReportResult } from "@/components/report-view";

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
  | {
      type: "meta";
      usedSample: boolean;
      cached?: boolean;
      reportId?: string | null;
      assessedAt?: string;
      runsRemainingThisHour?: number;
      rateLimitDistributed?: boolean;
    }
  | { type: "classified"; documentSummary: string; frameworks: string[] }
  | { type: "framework"; assessment: FrameworkAssessment }
  | { type: "done"; result: AssessResponse; reportId?: string | null; expiresAt?: string | null }
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
  const [reportId, setReportId] = useState<string | null>(null);
  const [reusedFrom, setReusedFrom] = useState<string | null>(null);

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
    setReportId(null);
    setReusedFrom(null);

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
        if (event.reportId) setReportId(event.reportId);
        break;
      case "meta":
        if (event.cached && event.reportId) {
          setReportId(event.reportId);
          setReusedFrom(event.assessedAt ?? null);
        }
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
        <div className="space-y-8 animate-rise">
          {/* The share and export affordances sit above the findings, because
              the moment a reader wants them is the moment they realise the
              result is worth keeping — which is before they have scrolled. */}
          <Card className="p-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="text-[13px] text-fg-muted space-y-1 min-w-0">
              <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                <span>{(data.trace.totalMs / 1000).toFixed(1)}s</span>
                <span>
                  {data.trace.totals.inputTokens.toLocaleString()} in /{" "}
                  {data.trace.totals.outputTokens.toLocaleString()} out
                </span>
                <span>
                  {data.trace.totals.estimatedCostUsd !== null
                    ? `$${data.trace.totals.estimatedCostUsd.toFixed(4)} in generation`
                    : "cost not attributable"}
                </span>
              </div>
              {reusedFrom ? (
                <p className="text-fg-faint">
                  This document had already been assessed, so the stored result was reused rather
                  than spending another run. The model is not deterministic, so a fresh run could
                  differ.
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2 ml-auto">
              {reportId ? (
                <>
                  <ButtonLink href={`/r/${reportId}`} variant="secondary" size="sm">
                    Permalink
                  </ButtonLink>
                  <ButtonLink
                    href={`/api/report/${reportId}/export`}
                    variant="secondary"
                    size="sm"
                  >
                    Download Markdown
                  </ButtonLink>
                </>
              ) : (
                <span className="text-[12px] text-fg-faint">
                  Not saved — no database is configured, so this result lives only on this page.
                </span>
              )}
            </div>
          </Card>

          <ReportBody result={data as unknown as ReportResult} />

          <Card className="p-4 space-y-3">
            <button
              onClick={() => setShowTrace(!showTrace)}
              className="text-xs underline underline-offset-4 text-fg-muted hover:text-fg"
              aria-expanded={showTrace}
            >
              {showTrace ? "Hide" : "Show"} the per-stage trace
            </button>
            {showTrace ? <TraceTable trace={data.trace as unknown as ReportResult["trace"]} /> : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
