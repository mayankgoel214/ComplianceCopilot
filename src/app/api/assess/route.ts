import { z } from "zod";
import { toPublicFailure } from "@/lib/errors/public-error";

import { assessDocumentStream, MAX_DOCUMENT_CHARS } from "@/lib/pipeline/assess";
import { ASSESS_BUCKET, visitorKeyFrom } from "@/lib/demo/rate-limit";
import { checkRateLimit } from "@/lib/rate-limit/redis";
import { findCachedReport, saveReport } from "@/lib/db/reports";
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
  // Served before the rate limit is spent: an identical document has already
  // been assessed, the answer is stored, and charging a visitor one of three
  // runs to be handed a row is a poor trade for both of us.
  //
  // The sample is deliberately exempt, and the test is on the content rather
  // than on the `useSample` flag. The page loads the sample into the textarea
  // and submits it as an ordinary document, so a flag-based exemption missed
  // the path almost every visitor actually takes — the sample was a cache hit,
  // returned in a tenth of a second with no stages, and the one document most
  // people run became the one that never showed the pipeline working.
  const isSample = document.trim() === DEMO_DOCUMENT.trim();
  const cached = isSample ? null : await findCachedReport(document);
  if (cached) {
    return new Response(
      `${JSON.stringify({ type: "meta", usedSample: useSample, cached: true, reportId: cached.id, assessedAt: cached.createdAt })}\n` +
        `${JSON.stringify({ type: "done", result: cached.result })}\n`,
      { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } }
    );
  }

  const limit = await checkRateLimit(visitorKeyFrom(request.headers), ASSESS_BUCKET);
  if (!limit.allowed) {
    return json(
      { error: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
      429,
      limit.retryAfterSeconds ? { "Retry-After": String(limit.retryAfterSeconds) } : undefined
    );
  }

  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      // A reader that goes away mid-run closes the stream under us, and every
      // subsequent enqueue throws `Invalid state: Controller is already
      // closed`. That is not a hypothetical: an assessment takes about twenty-
      // five seconds and emits a dozen events, so any visitor who navigates
      // away or hits stop lands in exactly this window. The throw was then
      // caught by the handler below, which tried to report it by sending one
      // more event, which threw again -- so a routine disconnect surfaced as an
      // unhandled error and a logged stack trace.
      //
      // Tracked rather than probed because ReadableStream exposes no "is this
      // still open" question worth asking, and `desiredSize === null` only
      // tells you about errored streams.
      const send = (event: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The reader is gone. Stop writing; there is nobody to tell.
          open = false;
        }
      };

      try {
        send({
          type: "meta",
          usedSample: useSample,
          cached: false,
          runsRemainingThisHour: limit.remaining,
          rateLimitDistributed: limit.distributed,
        });

        for await (const event of assessDocumentStream(document, projectDescription)) {
          if (event.type === "done") {
            // Saved before the terminal event, so the id can travel with it and
            // the reader gets a link in the same breath as the result.
            const saved = await saveReport(document, event.result);
            send({
              ...event,
              reportId: saved?.id ?? null,
              expiresAt: saved?.expiresAt ?? null,
            });
            continue;
          }
          send(event);

          // The reader has gone. Stop here rather than running the remaining
          // frameworks: each one is a retrieval plus a generation call, and
          // finishing an assessment nobody will read spends real money on
          // nothing. Breaking out of a for-await returns the generator, so the
          // pipeline's own cleanup still happens.
          if (!open) break;
        }
      } catch (error) {
        // Reported rather than papered over. An assessment that invents a
        // result when the model is unavailable is worse than one that admits
        // it failed.
        //
        // Classified rather than echoed, though: this used to forward the
        // upstream message straight to the browser, which meant a depleted
        // billing account announced itself to the public in the provider's own
        // words. The detail belongs in the server log.
        const failure = toPublicFailure(error, "assess");
        send({ type: "error", message: failure.message, kind: failure.kind });
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // Already closed by the reader disconnecting. Nothing to do.
          }
        }
      }
    },

    // Fired when the reader disconnects. Flips the same flag the writes check,
    // so the loop above stops at its next event instead of running to the end.
    cancel() {
      open = false;
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
