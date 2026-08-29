import { ChatPromptTemplate } from "@langchain/core/prompts";
import type { Document } from "@langchain/core/documents";

import { createChatModel, TraceCallbackHandler } from "../ai/langchain-model";
import { getGeminiEmbeddingService } from "../ai/gemini-embeddings";
import { getRetrievalStore } from "../retrieval/store";
import { VerityRetriever, formatPassages } from "../retrieval/langchain-retriever";
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
 * Composed with LCEL, and exposed as an async generator rather than a single
 * awaited call. A run takes around twenty-five seconds; behind one promise that
 * is twenty-five seconds of blank page, and the stages are genuinely
 * interesting — a visitor watching "retrieving GDPR" and then "verifying GDPR"
 * learns what the tool does in a way no spinner conveys.
 *
 * The stage worth explaining is the last but one. The model is required to
 * quote the document and the regulation it relies on, and both quotes are
 * checked against their sources before the finding is returned. A finding whose
 * regulation quote cannot be found in any passage the model was shown is marked
 * unsupported and excluded from the score. That is the difference between a
 * tool that produces compliance findings and one that produces confident
 * sentences shaped like compliance findings.
 */

export const MAX_DOCUMENT_CHARS = 24000;
const PASSAGES_PER_CONCERN = 4;
const MAX_PASSAGES_PER_FRAMEWORK = 12;

export interface AssessedFinding extends Finding {
  grounding: {
    regulation: { verdict: GroundingVerdict; similarity: number };
    document: { verdict: GroundingVerdict; similarity: number } | null;
  };
  supported: boolean;
}

export interface FrameworkAssessment {
  framework: string;
  confidence: number;
  rationale: string;
  concerns: string[];
  hasCorpus: boolean;
  score: number | null;
  passages: Array<{
    citation: string;
    heading: string;
    sourceUrl: string;
    rank: number;
    text: string;
  }>;
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

/** What the client is told as the run proceeds. */
export type AssessEvent =
  | { type: "stage"; stage: string; label: string; status: "start" | "done" }
  | { type: "classified"; documentSummary: string; frameworks: string[] }
  | { type: "framework"; assessment: FrameworkAssessment }
  | { type: "done"; result: AssessmentResult }
  | { type: "error"; message: string };

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

/**
 * Yields settled promises in completion order.
 *
 * The frameworks are independent and run concurrently; this is what lets each
 * reach the page the moment it is finished rather than when the slowest of them
 * is.
 */
async function* asCompleted<T>(promises: Promise<T>[]): AsyncGenerator<T> {
  const pending = new Map(promises.map((p, i) => [i, p.then((value) => ({ i, value }))]));
  while (pending.size > 0) {
    const { i, value } = await Promise.race(pending.values());
    pending.delete(i);
    yield value;
  }
}

export async function* assessDocumentStream(
  documentText: string,
  projectDescription: string
): AsyncGenerator<AssessEvent> {
  const trace = new Trace();
  const document = documentText.slice(0, MAX_DOCUMENT_CHARS);

  const store = await getRetrievalStore();
  const embeddings = getGeminiEmbeddingService();

  const embedQuery = async (query: string): Promise<number[]> =>
    trace.record("embed:query", "embed", async () => ({
      value: await embeddings.generateQueryEmbedding(query),
      model: AI_CONFIG.embeddings.model,
      // The embeddings endpoint returns no usage metadata, so this is recorded
      // as unknown rather than estimated from the text length.
      inputTokens: null,
      outputTokens: null,
    }));

  const index = {
    chunkCount: store.meta.chunkCount,
    sectionCount: store.meta.sectionCount,
    embeddingModel: store.meta.embeddingModel,
    dimensions: store.meta.dimensions,
  };

  // ---- 1. Classify ------------------------------------------------------
  yield { type: "stage", stage: "classify", label: "Reading the document", status: "start" };

  const classifyChain = ChatPromptTemplate.fromMessages([
    ["system", CLASSIFY_SYSTEM],
    ["human", "{input}"],
  ]).pipe(createChatModel({ maxOutputTokens: 8192 }).withStructuredOutput(ClassificationSchema));

  const classification = await classifyChain.invoke(
    {
      input: [
        projectDescription ? `Project description:\n${projectDescription}\n` : "",
        "Document:",
        document,
      ]
        .filter(Boolean)
        .join("\n"),
    },
    { callbacks: [new TraceCallbackHandler(trace, "classify")] }
  );

  yield { type: "stage", stage: "classify", label: "Reading the document", status: "done" };
  yield {
    type: "classified",
    documentSummary: classification.documentSummary,
    frameworks: classification.frameworks.map((f) => f.name),
  };

  if (classification.frameworks.length === 0) {
    // A document that triggers nothing is a legitimate outcome. What must not
    // happen is inventing a framework to fill the page.
    yield {
      type: "done",
      result: {
        documentSummary: classification.documentSummary,
        frameworks: [],
        grounding: { totalFindings: 0, supported: 0, unsupported: 0, groundedRate: 1 },
        index,
        trace: trace.summary(),
      },
    };
    return;
  }

  // ---- 2-5. Per framework, concurrently ---------------------------------
  const assessOne = async (
    detected: (typeof classification.frameworks)[number]
  ): Promise<FrameworkAssessment> => {
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

    const retriever = new VerityRetriever({
      embedQuery,
      mode: "dense",
      topK: PASSAGES_PER_CONCERN,
      framework: detected.name,
    });

    const t0 = Date.now();
    const perConcern = await Promise.all(
      detected.concerns.map((concern) => retriever.invoke(concern))
    );
    trace.add({
      name: `retrieve:${detected.name}`,
      kind: "retrieve",
      durationMs: Date.now() - t0,
      inputTokens: null,
      outputTokens: null,
      cached: false,
    });

    // Deduplicated across concerns, keeping each passage's best rank.
    const byId = new Map<string, Document>();
    for (const docs of perConcern) {
      for (const doc of docs) {
        const existing = byId.get(doc.metadata.id);
        if (!existing || doc.metadata.rank < existing.metadata.rank) {
          byId.set(doc.metadata.id, doc);
        }
      }
    }
    const passages = [...byId.values()]
      .sort((a, b) => a.metadata.rank - b.metadata.rank)
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

    const assessChain = ChatPromptTemplate.fromMessages([
      ["system", ASSESS_SYSTEM],
      [
        "human",
        "Framework: {framework}\n\nRegulation passages:\n{passages}\n\nSubmitted document:\n{document}",
      ],
    ]).pipe(createChatModel({ maxOutputTokens: 16384 }).withStructuredOutput(AssessmentSchema));

    const assessment = await assessChain.invoke(
      { framework: detected.name, passages: formatPassages(passages), document },
      { callbacks: [new TraceCallbackHandler(trace, `assess:${detected.name}`)] }
    );

    // ---- Verify every quote against its source --------------------------
    const t1 = Date.now();
    const passageTexts = passages.map((p) => `${p.metadata.heading}\n${p.pageContent}`);

    const findings: AssessedFinding[] = assessment.findings.map((finding) => {
      const regulation = verifyQuote(finding.regulationQuote, passageTexts);
      const documentGrounding =
        finding.documentQuote.trim().length > 0
          ? verifyQuote(finding.documentQuote, [document])
          : null;

      return {
        ...finding,
        grounding: {
          regulation: { verdict: regulation.verdict, similarity: regulation.similarity },
          document: documentGrounding
            ? { verdict: documentGrounding.verdict, similarity: documentGrounding.similarity }
            : null,
        },
        // A finding stands on its regulation quote. A missing document quote is
        // expected when the finding is about an absence.
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
        citation: p.metadata.citation,
        heading: p.metadata.heading,
        sourceUrl: p.metadata.sourceUrl,
        rank: p.metadata.rank,
        text: p.pageContent,
      })),
      findings,
    };
  };

  for (const framework of classification.frameworks) {
    yield {
      type: "stage",
      stage: framework.name,
      label: `Retrieving and assessing ${framework.name}`,
      status: "start",
    };
  }

  const assessments: FrameworkAssessment[] = [];
  for await (const assessment of asCompleted(classification.frameworks.map(assessOne))) {
    assessments.push(assessment);
    yield {
      type: "stage",
      stage: assessment.framework,
      label: `Retrieving and assessing ${assessment.framework}`,
      status: "done",
    };
    yield { type: "framework", assessment };
  }

  // Completion order is not a useful order to read in, so the final result is
  // put back into the order the classifier ranked them.
  const order = new Map(classification.frameworks.map((f, i) => [f.name, i]));
  assessments.sort((a, b) => (order.get(a.framework) ?? 0) - (order.get(b.framework) ?? 0));

  const allFindings = assessments.flatMap((a) => a.findings);
  const supported = allFindings.filter((f) => f.supported).length;

  yield {
    type: "done",
    result: {
      documentSummary: classification.documentSummary,
      frameworks: assessments,
      grounding: {
        totalFindings: allFindings.length,
        supported,
        unsupported: allFindings.length - supported,
        groundedRate: allFindings.length === 0 ? 1 : supported / allFindings.length,
      },
      index,
      trace: trace.summary(),
    },
  };
}

/** Non-streaming wrapper, for tests and any caller that is not a browser. */
export async function assessDocument(
  documentText: string,
  projectDescription: string
): Promise<AssessmentResult> {
  for await (const event of assessDocumentStream(documentText, projectDescription)) {
    if (event.type === "done") return event.result;
  }
  throw new Error("The pipeline finished without producing a result.");
}
