import { z } from "zod";

import { assessDocumentStream, MAX_DOCUMENT_CHARS } from "@/lib/pipeline/assess";
import { ASSESS_BUCKET, checkRateLimit, visitorKeyFrom } from "@/lib/demo/rate-limit";
import { DEMO_DOCUMENT, DEMO_PROJECT_DESCRIPTION } from "@/lib/demo/fixture";

/**
 * Runs the assessment pipeline, streaming progress as newline-delimited JSON.
 *
 * NDJSON rather than Server-Sent Events: the client is a `fetch` reader, not an
 * `EventSource`, because this is a POST with a body and EventSource cannot send
 * one. One JSON object per line is the whole protocol.
 *
 * The response is 200 as soon as the stream opens, so a failure partway through
 * cannot be signalled by status code. It is sent as a terminal `error` event
 * instead, and the client renders it — which is the only honest option once
 * bytes have already gone out.
 */
export const maxDuration = 300;

const BodySchema = z.object({
  document: z.string().max(MAX_DOCUMENT_CHARS).optional(),
  projectDescription: z.string().max(2000).optional(),
  useSample: z.boolean().optional(),
});

function json(body: unknown, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function POST(request: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ")
            : "Request body was not valid JSON.",
      },
      400
    );
  }

  const useSample = body.useSample ?? !body.document;
  const document = useSample ? DEMO_DOCUMENT : (body.document ?? "");
  const projectDescription = useSample ? DEMO_PROJECT_DESCRIPTION : (body.projectDescription ?? "");

  if (document.trim().length < 200) {
    return json({ error: "Give it at least 200 characters of document to work with." }, 400);
  }

  // Metered only once the request is known to be well formed. A malformed body
  // costs nothing to reject, so charging it against the visitor's allowance
  // would spend their quota on a request that was never going to reach a model.
  const limit = checkRateLimit(visitorKeyFrom(request.headers), ASSESS_BUCKET);
  if (!limit.allowed) {
    return json(
      { error: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
      429,
      limit.retryAfterSeconds ? { "Retry-After": String(limit.retryAfterSeconds) } : undefined
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));

      try {
        send({ type: "meta", usedSample: useSample, runsRemainingThisHour: limit.remaining });
        for await (const event of assessDocumentStream(document, projectDescription)) {
          send(event);
        }
      } catch (error) {
        // Reported rather than papered over. An assessment that invents a
        // result when the model is unavailable is worse than one that admits
        // it failed.
        console.error("Assessment failed:", error);
        send({
          type: "error",
          message:
            error instanceof Error ? error.message.slice(0, 400) : "The assessment failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      // Without this a proxy may buffer the whole response, which would deliver
      // every progress event at once and defeat the point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
