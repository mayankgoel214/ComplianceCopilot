import { NextResponse } from "next/server";
import { z } from "zod";

import { assessDocument, MAX_DOCUMENT_CHARS } from "@/lib/pipeline/assess";
import { ASSESS_BUCKET, checkRateLimit, visitorKeyFrom } from "@/lib/demo/rate-limit";
import { DEMO_DOCUMENT, DEMO_PROJECT_DESCRIPTION } from "@/lib/demo/fixture";

/**
 * Runs the assessment pipeline. Public, unauthenticated, and rate limited.
 *
 * Accepting a document from an anonymous caller means accepting a prompt from
 * one, so the length is capped before anything reaches the model and the
 * per-visitor ceiling is low. `useSample: true` runs the fixed demo document
 * instead, which is the path the demo page takes.
 */
export const maxDuration = 300;

const BodySchema = z.object({
  document: z.string().max(MAX_DOCUMENT_CHARS).optional(),
  projectDescription: z.string().max(2000).optional(),
  useSample: z.boolean().optional(),
});

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")
            : "Request body was not valid JSON.",
      },
      { status: 400 }
    );
  }

  const useSample = body.useSample ?? !body.document;
  const document = useSample ? DEMO_DOCUMENT : (body.document ?? "");
  const projectDescription = useSample
    ? DEMO_PROJECT_DESCRIPTION
    : (body.projectDescription ?? "");

  if (document.trim().length < 200) {
    return NextResponse.json(
      { error: "Give it at least 200 characters of document to work with." },
      { status: 400 }
    );
  }

  // Metered only once the request is known to be well formed. A malformed body
  // costs nothing to reject, so charging it against the visitor's allowance
  // would spend their quota on a request that was never going to reach a model.
  const limit = checkRateLimit(visitorKeyFrom(request.headers), ASSESS_BUCKET);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
      {
        status: 429,
        headers: limit.retryAfterSeconds
          ? { "Retry-After": String(limit.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  try {
    const result = await assessDocument(document, projectDescription);
    return NextResponse.json({ ...result, usedSample: useSample, runsRemainingThisHour: limit.remaining });
  } catch (error) {
    // Reported rather than papered over. An assessment that invents a result
    // when the model is unavailable is worse than one that admits it failed.
    console.error("Assessment failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message.slice(0, 400) : "The assessment failed." },
      { status: 502 }
    );
  }
}
