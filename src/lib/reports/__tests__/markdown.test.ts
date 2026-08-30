import { reportToMarkdown } from "../markdown";
import type { AssessmentResult } from "@/lib/pipeline/assess";

function result(overrides: Partial<AssessmentResult> = {}): AssessmentResult {
  return {
    documentSummary: "A data management plan for a clinical study.",
    frameworks: [
      {
        framework: "HIPAA",
        confidence: 0.9,
        rationale: "Clinical measurements are stored alongside academic records.",
        concerns: ["health data stored with student records"],
        hasCorpus: true,
        score: 72,
        passages: [
          { citation: "45 CFR 164.312", heading: "Technical safeguards", sourceUrl: "https://x", rank: 1 },
        ],
        findings: [
          {
            requirement: "Encrypt electronic protected health information",
            status: "missing",
            severity: "high",
            explanation: "Transfers are not encrypted at rest.",
            documentQuote: "Transfers are not encrypted at rest.",
            regulationQuote: "Implement a mechanism to encrypt and decrypt electronic protected health information.",
            citation: "45 CFR 164.312",
            supported: true,
            grounding: {
              regulation: { verdict: "exact", similarity: 1 },
              document: { verdict: "exact", similarity: 1 },
            },
          },
        ],
      },
    ],
    grounding: { totalFindings: 1, supported: 1, unsupported: 0, groundedRate: 1 },
    index: { chunkCount: 1147, sectionCount: 413, embeddingModel: "gemini-embedding-001", dimensions: 768 },
    trace: {
      totalMs: 27200,
      spans: [],
      totals: {
        inputTokens: 15511,
        outputTokens: 2078,
        estimatedCostUsd: 0.0098,
        unpricedEmbeddingCalls: 9,
        cachedSpans: 0,
      },
    },
    ...overrides,
  } as AssessmentResult;
}

describe("reportToMarkdown", () => {
  it("carries both quotes and the citation", () => {
    const md = reportToMarkdown(result());
    expect(md).toContain("Implement a mechanism to encrypt");
    expect(md).toContain("Transfers are not encrypted at rest.");
    expect(md).toContain("45 CFR 164.312");
  });

  it("carries the grounding verdict, which is the part worth keeping", () => {
    const md = reportToMarkdown(result());
    expect(md).toContain("citation exact");
    expect(md).toMatch(/1 of 1 findings quoted regulation text/);
  });

  it("marks an unsupported finding as excluded rather than dropping it", () => {
    const r = result();
    r.frameworks[0].findings[0].supported = false;
    r.frameworks[0].findings[0].grounding.regulation = { verdict: "unsupported", similarity: 0.1 };
    r.grounding = { totalFindings: 1, supported: 0, unsupported: 1, groundedRate: 0 };

    const md = reportToMarkdown(r);
    expect(md).toContain("UNSUPPORTED, excluded from the score");
    expect(md).toContain("cited text that could not be located");
  });

  it("says a framework without a corpus has nothing to cite", () => {
    const r = result();
    r.frameworks[0] = { ...r.frameworks[0], framework: "SOC 2", hasCorpus: false, score: null, findings: [] };
    const md = reportToMarkdown(r);
    expect(md).toContain("SOC 2");
    expect(md).toContain("copyrighted");
    expect(md).not.toContain("SOC 2 — ");
  });

  it("includes the permalink and assessment time when given them", () => {
    const md = reportToMarkdown(result(), {
      url: "https://verity-compliance.vercel.app/r/abc123",
      assessedAt: new Date("2026-08-30T00:38:26.510Z"),
    });
    expect(md).toContain("https://verity-compliance.vercel.app/r/abc123");
    expect(md).toContain("2026-08-30T00:38:26.510Z");
  });

  it("reports the cost only when it is attributable", () => {
    expect(reportToMarkdown(result())).toContain("$0.0098");

    const r = result();
    r.trace.totals.estimatedCostUsd = null;
    expect(reportToMarkdown(r)).not.toContain("$");
  });

  it("handles a run that found nothing without inventing a section", () => {
    const md = reportToMarkdown(
      result({ frameworks: [], grounding: { totalFindings: 0, supported: 0, unsupported: 0, groundedRate: 1 } })
    );
    expect(md).toContain("No findings were produced");
  });
});
