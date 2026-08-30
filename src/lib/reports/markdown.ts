import type { AssessmentResult } from "../pipeline/assess";

/**
 * A report as Markdown.
 *
 * Markdown rather than PDF: it pastes into a ticket, a pull request or an email
 * without a viewer, it diffs, and it does not need a rendering engine inside a
 * serverless function. Anyone who wants a PDF can print the page, which is
 * already laid out for it.
 *
 * The grounding verdicts travel with the findings. A report that dropped them
 * on the way out would be exactly the artefact this project argues against:
 * confident text with no way to tell which parts were checked.
 */
export function reportToMarkdown(
  result: AssessmentResult,
  meta: { id?: string; url?: string; assessedAt?: Date } = {}
): string {
  const lines: string[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  lines.push("# Compliance assessment");
  lines.push("");
  lines.push(
    "Produced by Verity, which retrieves regulation text and requires the model to quote it. Every quote below was checked against the passage the model was shown before this was written. Not legal advice."
  );
  lines.push("");
  if (meta.assessedAt) lines.push(`- **Assessed:** ${meta.assessedAt.toISOString()}`);
  if (meta.url) lines.push(`- **Permalink:** ${meta.url}`);
  lines.push(
    `- **Corpus:** ${result.index.sectionCount} sections, ${result.index.chunkCount} passages, ${result.index.dimensions}d \`${result.index.embeddingModel}\``
  );
  lines.push("");

  lines.push("## What it read");
  lines.push("");
  lines.push(result.documentSummary);
  lines.push("");

  lines.push("## Citation grounding");
  lines.push("");
  if (result.grounding.totalFindings === 0) {
    lines.push("No findings were produced, so there was nothing to verify.");
  } else {
    lines.push(
      `${result.grounding.supported} of ${result.grounding.totalFindings} findings quoted regulation text that was found in the passages the model was shown (${pct(result.grounding.groundedRate)}).`
    );
    if (result.grounding.unsupported > 0) {
      lines.push("");
      lines.push(
        `${result.grounding.unsupported} cited text that could not be located. Those are marked below and excluded from every score.`
      );
    }
  }
  lines.push("");

  for (const framework of result.frameworks) {
    lines.push(
      `## ${framework.framework}${framework.score !== null ? ` — ${framework.score}/100` : ""}`
    );
    lines.push("");
    lines.push(`_Confidence ${pct(framework.confidence)}._ ${framework.rationale}`);
    lines.push("");

    if (!framework.hasCorpus) {
      lines.push(
        "> Detected, but its text is copyrighted and is not in the corpus, so there is nothing to cite. No findings and no score are produced for it."
      );
      lines.push("");
      continue;
    }

    if (framework.findings.length === 0) {
      lines.push(`No findings against the ${framework.passages.length} passages retrieved.`);
      lines.push("");
      continue;
    }

    for (const finding of framework.findings) {
      const flag = finding.supported ? "" : " — UNSUPPORTED, excluded from the score";
      lines.push(`### ${finding.requirement}`);
      lines.push("");
      lines.push(
        `**${finding.severity} · ${finding.status}** · citation ${finding.grounding.regulation.verdict}${flag}`
      );
      lines.push("");
      lines.push(finding.explanation);
      lines.push("");
      if (finding.documentQuote) {
        lines.push(`> ${finding.documentQuote}`);
        lines.push(
          `> — from the submitted document (${finding.grounding.document?.verdict ?? "not checked"})`
        );
        lines.push("");
      }
      lines.push(`> ${finding.regulationQuote}`);
      lines.push(`> — ${finding.citation} (${finding.grounding.regulation.verdict})`);
      lines.push("");
    }
  }

  lines.push("## How this was produced");
  lines.push("");
  lines.push(
    `Classification, retrieval per concern, assessment against the retrieved passages, then verification of every quote. ${(result.trace.totalMs / 1000).toFixed(1)}s, ${result.trace.totals.inputTokens.toLocaleString()} input and ${result.trace.totals.outputTokens.toLocaleString()} output tokens` +
      (result.trace.totals.estimatedCostUsd !== null
        ? `, about $${result.trace.totals.estimatedCostUsd.toFixed(4)} in generation at published rates.`
        : ".")
  );
  lines.push("");
  return lines.join("\n");
}
