import * as Sentry from "@sentry/nextjs";

/**
 * Browser-side error reporting.
 *
 * No session replay and no performance tracing on the client: this is four
 * mostly-static pages, and replay would ship a large bundle to record a visitor
 * reading a table. Errors only.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    enabled: process.env.NODE_ENV === "production",
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
