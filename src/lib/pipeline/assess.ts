import { generateStructured } from "../ai/gemini-client";
import { getGeminiEmbeddingService } from "../ai/gemini-embeddings";
import { getRetrievalStore } from "../retrieval/store";
import type { Chunk, ScoredChunk } from "../retrieval/types";
import { verifyQuote, type GroundingVerdict } from "../grounding/verify";
import { Trace, type TraceSummary } from "../telemetry/trace";
import { AI_CONFIG } from "../ai/config";
import {
  AssessmentSchema,
  ClassificationSchema,
  FRAMEWORKS_WITH_CORPUS,
  SUPPORTED_FRAMEWORKS,
  type Finding,
} from "./schema";

/**
 * The assessment pipeline.
 *
 *   classify -> decompose into probes -> retrieve -> assess -> verify -> score
 *
 * The stage worth explaining is the last but one. The model is required to
 * quote the document and the regulation it is relying on, and both quotes are
 * checked against their sources before the finding is returned. A finding whose
 * regulation quote cannot be found in any passage the model was shown is
 * marked unsupported and excluded from the score. That is the difference
 * between a tool that produces compliance findings and one that produces
 * confident sentences shaped like compliance findings.
 */

export const MAX_DOCUMENT_CHARS = 24000;
const PASSAGES_PER_CONCERN = 4;
const MAX_PASSAGES_PER_FRAMEWORK = 12;

export interface AssessedFinding extends Finding {
  grounding: {
    regulation: { verdict: GroundingVerdict; similarity: number };
    document: { verdict: GroundingVerdict; similarity: number } | null;
  };
  /** False when the regulation quote could not be found in the retrieved passages. */
  supported: boolean;
}

export interface FrameworkAssessment {
  framework: string;
  confidence: number;
  rationale: string;
  concerns: string[];
  hasCorpus: boolean;
  /** Null when the framework has no corpus, so no score is invented for it. */
  score: number | null;
  passages: Array<{ citation: string; heading: string; sourceUrl: string; rank: number; text: string }>;
  findings: AssessedFinding[];
}

export interface AssessmentResult {
  documentSummary: string;
  frameworks: FrameworkAssessment[];
  grounding: {
    totalFindings: number;
    supported: number;
    unsupported: number;
    groundedRate: number;
  };
  index: { chunkCount: number; sectionCount: number; embeddingModel: string; dimensions: number };
  trace: TraceSummary;
}

const CLASSIFY_SYSTEM = [
  "You identify which regulatory frameworks apply to a document describing a research or academic system.",
  "",
  `The only frameworks you may name are: ${SUPPORTED_FRAMEWORKS.join(", ")}.`,
  "",
  "Name a framework only when something in the document actually triggers it, and say what.",
  "Do not list a framework because it is commonly relevant to universities.",
  "",
  "For each framework give 1-5 short `concerns`: the specific thing in this document",
  "that might create an obligation, phrased as the concern rather than as the rule.",
  'Good: "health measurements collected from minors are stored with academic records".',
  'Bad: "requirements for protected health information under the Security Rule".',
].join("\n");

const ASSESS_SYSTEM = [
  "You assess a document against passages of regulation text supplied to you.",
  "",
  "Rules you must follow:",
  "1. Every finding must quote the regulation passage it relies on, verbatim, in",
  "   `regulationQuote`, and name that passage's citation in `citation`.",
  "   Quote only from the passages given to you. Do not quote from memory.",
  "2. `documentQuote` must be verbatim from the submitted document. If the finding",
  "   is that something is absent from the document, leave it as an empty string.",
  "3. Do not invent requirements that are not in the supplied passages.",
  "4. Prefer fewer, better-evidenced findings over many weak ones.",
  "",
  "Both quotes are checked against their sources automatically. A finding whose",
  "quote cannot be found is discarded, so a fabricated quote costs you the finding.",
].join("\n");

const SEVERITY_PENALTY: Record<Finding["severity"], number> = {
  critical: 30,
  high: 18,
  medium: 9,
  low: 4,
};

const STATUS_WEIGHT: Record<Finding["status"], number> = {
  missing: 1,
  partial: 0.5,
  unclear: 0.25,
  met: 0,
};

/**
 * A score out of 100, computed from the supported findings alone.
 *
 * Deliberately arithmetic rather than asked of the model. A number the model
 * produces is a number nobody can reproduce or argue with; this one is a
 * function of findings a reader can see, so a reader who disagrees with the
 * score can point at the finding that caused it.
 */
function scoreFrom(findings: AssessedFinding[]): number {
  const penalty = findings
    .filter((f) => f.supported)
    .reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity] * STATUS_WEIGHT[f.status], 0);
  return Math.max(0, Math.round(100 - penalty));
}

export async function assessDocument(
  documentText: string,
  projectDescription: string
): Promise<AssessmentResult> {
  const trace = new Trace();
  const document = documentText.slice(0, MAX_DOCUMENT_CHARS);

  const store = await getRetrievalStore();
  const embeddings = getGeminiEmbeddingService();

  const embedQuery = async (query: string): Promise<number[]> =>
    trace.record("embed:query", "embed", async () => ({
      value: await embeddings.generateQueryEmbedding(query),
      model: AI_CONFIG.embeddings.model,
      // The embeddings endpoint does not return usage metadata, so this is
      // recorded as unknown rather than estimated from the text length.
      inputTokens: null,
      outputTokens: null,
    }));

  // ---- 1. Classify -------------------------------------------------------
  const classification = await generateStructured(
    [
      projectDescription ? `Project description:\n${projectDescription}\n` : "",
      "Document:",
      document,
    ]
      .filter(Boolean)
      .join("\n"),
    ClassificationSchema,
    { system: CLASSIFY_SYSTEM, trace, label: "classify", maxOutputTokens: 8192 }
  );

  if (classification.frameworks.length === 0) {
    // Reported as a result, not an error: a document that triggers nothing is a
    // legitimate outcome. What must not happen is inventing a framework to fill
    // the page.
    return {
      documentSummary: classification.documentSummary,
      frameworks: [],
      grounding: { totalFindings: 0, supported: 0, unsupported: 0, groundedRate: 1 },
      index: {
        chunkCount: store.meta.chunkCount,
        sectionCount: store.meta.sectionCount,
        embeddingModel: store.meta.embeddingModel,
        dimensions: store.meta.dimensions,
      },
      trace: trace.summary(),
    };
  }

  // Frameworks are independent of one another, so they are assessed
  // concurrently. Run in sequence this took about a minute for four frameworks,
  // which is past the point where a visitor assumes the page is broken — and
  // past the request ceiling on the platform it deploys to.
  const assessments = await Promise.all(
    classification.frameworks.map(async (detected): Promise<FrameworkAssessment> => {
    const hasCorpus = (FRAMEWORKS_WITH_CORPUS as readonly string[]).includes(detected.name);

    if (!hasCorpus) {
      // SOC 2 and ISO 27001. The classifier can recognise them; there is no
      // text to cite, so no findings are produced and no score is invented.
      return {
        framework: detected.name,
        confidence: detected.confidence,
        rationale: detected.rationale,
        concerns: detected.concerns,
        hasCorpus: false,
        score: null,
        passages: [],
        findings: [],
      };
    }

    // ---- 2 & 3. Decompose into probes, retrieve for each -----------------
    const retrieved = new Map<string, ScoredChunk>();
    const t0 = Date.now();
    const perConcern = await Promise.all(
      detected.concerns.map((concern) =>
        store.search(concern, embedQuery, {
          mode: "dense",
          topK: PASSAGES_PER_CONCERN,
          framework: detected.name,
        })
      )
    );
    for (const result of perConcern) {
      for (const hit of result.results) {
        const existing = retrieved.get(hit.chunk.id);
        if (!existing || hit.rank < existing.rank) retrieved.set(hit.chunk.id, hit);
      }
    }
    trace.add({
      name: `retrieve:${detected.name}`,
      kind: "retrieve",
      durationMs: Date.now() - t0,
      inputTokens: null,
      outputTokens: null,
      cached: false,
    });

    const passages = [...retrieved.values()]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_PASSAGES_PER_FRAMEWORK);

    if (passages.length === 0) {
      return {
        framework: detected.name,
        confidence: detected.confidence,
        rationale: detected.rationale,
        concerns: detected.concerns,
        hasCorpus: true,
        score: null,
        passages: [],
        findings: [],
      };
    }

    // ---- 4. Assess against the retrieved passages ------------------------
    const passageBlock = passages
      .map((p, i) => `[${i + 1}] ${p.chunk.citation} — ${p.chunk.heading}\n${p.chunk.text}`)
      .join("\n\n");

    const assessment = await generateStructured(
      [
        `Framework: ${detected.name}`,
        "",
        "Regulation passages:",
        passageBlock,
        "",
        "Submitted document:",
        document,
      ].join("\n"),
      AssessmentSchema,
      {
        system: ASSESS_SYSTEM,
        trace,
        label: `assess:${detected.name}`,
        maxOutputTokens: 16384,
      }
    );

    // ---- 5. Verify every quote against its source ------------------------
    const t1 = Date.now();
    const passageTexts = passages.map((p) => `${p.chunk.heading}\n${p.chunk.text}`);

    const findings: AssessedFinding[] = assessment.findings.map((finding) => {
      const regulation = verifyQuote(finding.regulationQuote, passageTexts);
      const documentGrounding =
        finding.documentQuote.trim().length > 0 ? verifyQuote(finding.documentQuote, [document]) : null;

      return {
        ...finding,
        grounding: {
          regulation: { verdict: regulation.verdict, similarity: regulation.similarity },
          document: documentGrounding
            ? { verdict: documentGrounding.verdict, similarity: documentGrounding.similarity }
            : null,
        },
        // A finding stands on its regulation quote. A missing or unverifiable
        // document quote is expected when the finding is about an absence, so
        // it does not by itself disqualify the finding.
        supported: regulation.verdict !== "unsupported",
      };
    });

    trace.add({
      name: `ground:${detected.name}`,
      kind: "ground",
      durationMs: Date.now() - t1,
      inputTokens: null,
      outputTokens: null,
      cached: false,
    });

    return {
      framework: detected.name,
      confidence: detected.confidence,
      rationale: detected.rationale,
      concerns: detected.concerns,
      hasCorpus: true,
      score: scoreFrom(findings),
      passages: passages.map((p) => ({
        citation: p.chunk.citation,
        heading: p.chunk.heading,
        sourceUrl: p.chunk.sourceUrl,
        rank: p.rank,
        text: p.chunk.text,
      })),
      findings,
    };
    })
  );

  const allFindings = assessments.flatMap((a) => a.findings);
  const supported = allFindings.filter((f) => f.supported).length;

  return {
    documentSummary: classification.documentSummary,
    frameworks: assessments,
    grounding: {
      totalFindings: allFindings.length,
      supported,
      unsupported: allFindings.length - supported,
      groundedRate: allFindings.length === 0 ? 1 : supported / allFindings.length,
    },
    index: {
      chunkCount: store.meta.chunkCount,
      sectionCount: store.meta.sectionCount,
      embeddingModel: store.meta.embeddingModel,
      dimensions: store.meta.dimensions,
    },
    trace: trace.summary(),
  };
}

export type { Chunk };
