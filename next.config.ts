import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    "/evaluation": ["./eval/results.json"],
    "/api/assess": ["./data/**"],
    "/api/search": ["./data/**"],
    "/api/index-stats": ["./data/**", "./eval/results.json"],
    "/api/health": ["./data/**"],
  },
};

export default nextConfig;
