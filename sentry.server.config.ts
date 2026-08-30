import * as Sentry from "@sentry/nextjs";

/**
 * Server-side error reporting.
 *
 * Wired by hand rather than through `npx @sentry/wizard`, which rewrites
 * next.config.ts — and this project's next.config.ts carries the file-tracing
 * and serverExternalPackages settings that PDF extraction and the retrieval
 * index both depend on. Losing those to a codemod would break production in a
 * way that passes every local check.
 *
 * Absent DSN means absent Sentry, silently. Verity runs from a clean clone with
 * one API key; making it also demand an error-reporting account would be a
 * strange thing to require of someone trying the retrieval playground.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    // Every trace, because this is a portfolio project handling a handful of
    // requests an hour. On anything busier this is the first number to lower.
    tracesSampleRate: 1,
    // The free tier's quota is shared across the org, and a development loop
    // produces far more errors than production ever will.
    enabled: process.env.NODE_ENV === "production",
    beforeSend(event) {
      // Documents people paste in are the one thing here that could be
      // sensitive, and an exception thrown mid-pipeline can carry a slice of
      // one in its message. Request bodies are dropped outright rather than
      // trusted to Sentry's scrubbing.
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
      }
      return event;
    },
  });
}
