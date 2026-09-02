import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /**
   * pdfjs loads its worker with a relative URL that a bundler rewrites to a
   * chunk path it then never emits — the failure surfaces at parse time as
   * "Setting up fake worker failed", pointing at a file under .next/server that
   * does not exist. Leaving these two packages external means they are required
   * from node_modules at runtime, where their own relative paths still resolve.
   */
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],

  /**
   * Security headers, applied to every response.
   *
   * `script-src` carries `'unsafe-inline'`, and that is a deliberate trade
   * rather than an oversight. A nonce was tried first and does not work here:
   * `/`, `/assess` and `/evaluation` are prerendered and revalidate hourly, so
   * the HTML a visitor receives was rendered before the request existed and
   * cannot carry that request's nonce — the browser then blocks Next's own
   * hydration payload and the page renders but never becomes interactive.
   * Hashes fail for the same reason from the other side: twelve of the
   * thirteen inline scripts are Next's flight data, whose contents change with
   * every build and every route. The remaining options were to force every
   * page dynamic and lose the hourly cache, or to accept inline script and
   * lock down everything else. This is the second.
   *
   * What that leaves standing is still worth having: no script may load from
   * another origin, no plugin content, no framing, no form posting off-site,
   * and no base-tag rewrite. The application renders no user-supplied HTML —
   * the one inline script is the theme no-flash snippet in `layout.tsx`, and
   * everything else goes through React, which escapes.
   */
  async headers() {
    /**
     * Sentry runs in the browser too, and `connect-src 'self'` blocks it
     * silently — the page works, the errors simply never arrive, which is the
     * worst way for monitoring to fail. The host is read out of the DSN rather
     * than written here, so rotating the DSN cannot leave the policy pointing
     * at the wrong ingest endpoint.
     */
    const sentryHost = (() => {
      try {
        return process.env.NEXT_PUBLIC_SENTRY_DSN
          ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin
          : null;
      } catch {
        return null;
      }
    })();

    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      `connect-src 'self'${sentryHost ? ` ${sentryHost}` : ""}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          // Stop the browser guessing a type for an upload we echo back.
          { key: "X-Content-Type-Options", value: "nosniff" },
          // A report link should not leak its path to whatever it links out to.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Nothing here needs a camera, a microphone or a location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          // frame-ancestors already says this; this is for browsers that predate it.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },

  /**
   * The retrieval index and the evaluation results are plain files read at
   * runtime with `fs`. Next's tracer follows imports, not `readFile` calls with
   * a computed path, so without this they are simply absent from the deployed
   * bundle and every route that needs them 500s in production while working
   * perfectly in development. Naming them here is what makes the deploy match
   * the local run.
   */
  outputFileTracingIncludes: {
    "/": ["./data/**", "./eval/results.json"],
    "/evaluation": ["./eval/results.json", "./eval/chunking-results.json"],
    // The link-preview card reads the evaluation results too, and a route that
    // reads a file it was not traced for fails only in production.
    "/opengraph-image": ["./eval/results.json"],
    "/api/assess": ["./data/**"],
    "/api/search": ["./data/**"],
    "/api/index-stats": ["./data/**", "./eval/results.json", "./eval/chunking-results.json"],
    "/api/health": ["./data/**"],
    // pdfjs loads its worker from disk at parse time, so the file has to be in
    // the deployed bundle. Nothing imports it, so the tracer cannot find it.
    // pdfjs loads its worker from disk and reaches for @napi-rs/canvas to get
    // DOM globals that Node does not provide. Nothing imports either of them
    // statically, so the tracer cannot find them and they have to be named.
    // Without the canvas package the module fails to evaluate at all, with
    // "DOMMatrix is not defined" thrown from the import rather than the parse.
    "/api/extract": [
      "./node_modules/pdf-parse/dist/**",
      "./node_modules/pdfjs-dist/legacy/build/**",
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-*/**",
    ],
  },
};

/**
 * Sentry wraps the config rather than replacing it.
 *
 * Everything above — the file tracing that puts data/ and pdfjs's worker in the
 * deployment, and the externalised packages that let pdfjs resolve its own
 * paths — is load-bearing in production and invisible in development. The
 * wizard would have rewritten this file; wrapping it by hand keeps both.
 */
export default withSentryConfig(nextConfig, {
  silent: true,
  // Source maps are uploaded only when a token is configured, so a build
  // without one succeeds instead of failing on an upload it cannot perform.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  disableLogger: true,
});
