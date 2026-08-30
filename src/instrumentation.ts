/**
 * Loads the right Sentry config for whichever runtime is starting.
 *
 * Next calls this once per runtime, which is the only place a server-side SDK
 * can be initialised before the code it is meant to watch.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
