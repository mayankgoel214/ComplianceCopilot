import type { NextConfig } from "next";

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

export default nextConfig;
