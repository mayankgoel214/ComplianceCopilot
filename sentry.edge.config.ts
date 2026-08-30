import * as Sentry from "@sentry/nextjs";

/** Middleware and edge routes. Same reasoning as sentry.server.config.ts. */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1,
    enabled: process.env.NODE_ENV === "production",
  });
}
