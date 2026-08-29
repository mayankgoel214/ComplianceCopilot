import { z } from "zod";

import { AI_CONFIG } from "../ai/config";

/**
 * The shapes the model is held to.
 *
 * These are the contract between the model and everything downstream. Fields
 * are required unless the model can genuinely be unable to supply them, because
 * an optional field is one the model will learn to omit, and an omitted
 * `evidence` is exactly the omission that matters here.
 */

export const SUPPORTED_FRAMEWORKS = AI_CONFIG.compliance.frameworks;

/** The frameworks the retrieval corpus actually covers. The other two are
 *  copyrighted standards that cannot be redistributed, so Verity can classify
 *  a document against them but has nothing to cite. */
export const FRAMEWORKS_WITH_CORPUS = [
  "FERPA",
  "HIPAA",
  "GDPR",
  "IRB",
  "ADA/Section 508",
  "Export Controls (EAR/ITAR)",
] as const;

export const FrameworkNameSchema = z.enum(
  SUPPORTED_FRAMEWORKS as unknown as [string, ...string[]]
);

export const ClassificationSchema = z.object({
  frameworks: z
    .array(
      z.object({
        name: FrameworkNameSchema,
        confidence: z.number().min(0).max(1),
        rationale: z.string().min(10),
        /**
         * Short phrases naming what in the document might create an obligation.
         * These become retrieval queries, which is why they are required and
         * why the prompt asks for the concern rather than the rule — a query
         * written in the regulation's own words retrieves the section the model
         * already had in mind instead of the one the document needs.
         */
        concerns: z.array(z.string().min(8)).min(1).max(5),
      })
    )
    .max(8),
  documentSummary: z.string().min(20),
});

export type Classification = z.infer<typeof ClassificationSchema>;

export const FindingSchema = z.object({
  requirement: z.string().min(8),
  status: z.enum(["met", "partial", "missing", "unclear"]),
  severity: z.enum(["critical", "high", "medium", "low"]),
  explanation: z.string().min(20),
  /** Verbatim from the submitted document. Empty when the finding is that
   *  something is absent, which is the one case where there is nothing to quote. */
  documentQuote: z.string(),
  /** Verbatim from one of the regulation passages supplied in the prompt. */
  regulationQuote: z.string().min(10),
  /** The citation of the passage the regulation quote came from. */
  citation: z.string().min(3),
});

export const AssessmentSchema = z.object({
  findings: z.array(FindingSchema).max(12),
});

export type Finding = z.infer<typeof FindingSchema>;
