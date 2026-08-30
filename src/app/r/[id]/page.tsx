import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { loadReport } from "@/lib/db/reports";
import { ButtonLink, Card, Citation, Section } from "@/components/ui";
import { ReportBody, TraceTable, type ReportResult } from "@/components/report-view";

/**
 * A saved assessment at a permanent-ish URL.
 *
 * Rendered on the server from the stored row, so the link works for someone who
 * has never used Verity and does not re-run anything — a shared report costs no
 * model calls.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) return { title: "Report not found" };

  const frameworks = report.result.frameworks.map((f) => f.framework).join(", ");
  return {
    title: "Compliance assessment",
    description: `${report.result.grounding.totalFindings} findings across ${frameworks || "no frameworks"}, each quoting the regulation behind it.`,
    // Shared links to someone's document should not be indexed.
    robots: { index: false, follow: false },
  };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await loadReport(id);
  if (!report) notFound();

  const result = report.result as unknown as ReportResult;
  const daysLeft = Math.max(
    0,
    Math.ceil((report.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-12 space-y-10">
      <header className="space-y-4">
        <h1 className="text-4xl">Compliance assessment</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-fg-muted">
          <span>Assessed {formatDate(report.createdAt)} UTC</span>
          <span>·</span>
          <span>
            {daysLeft === 0 ? "Expires today" : `Expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </span>
        </div>
        <p className="text-sm text-fg-muted leading-relaxed max-w-2xl">
          Every finding below quotes the regulation it relies on, and every quote was checked
          against the passage the model was shown before this page was written. Verity is not legal
          advice.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <ButtonLink href={`/api/report/${report.id}/export`} variant="secondary" size="sm">
            Download as Markdown
          </ButtonLink>
          <ButtonLink href="/assess" variant="ghost" size="sm">
            Assess your own document →
          </ButtonLink>
        </div>
      </header>

      <ReportBody result={result} />

      <Section
        title="The document this was run against"
        description="Kept with the report, because a finding you cannot check against its source is the thing this tool exists not to produce. It is deleted when the report expires."
      >
        <Card className="p-4">
          <pre className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-fg-muted max-h-[420px] overflow-y-auto">
            {report.document}
          </pre>
        </Card>
      </Section>

      <Section
        title="How this was produced"
        description={
          <>
            {(result.trace.totalMs / 1000).toFixed(1)}s ·{" "}
            {result.trace.totals.inputTokens.toLocaleString()} in /{" "}
            {result.trace.totals.outputTokens.toLocaleString()} out tokens ·{" "}
            {result.trace.totals.estimatedCostUsd !== null
              ? `$${result.trace.totals.estimatedCostUsd.toFixed(4)} in generation at published rates`
              : "generation cost not attributable"}
          </>
        }
      >
        <Card className="p-4">
          <TraceTable trace={result.trace} />
        </Card>
        <Citation>
          {result.index.sectionCount} sections · {result.index.chunkCount} passages ·{" "}
          {result.index.dimensions}d {result.index.embeddingModel}
        </Citation>
      </Section>
    </div>
  );
}
