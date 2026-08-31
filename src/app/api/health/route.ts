import { NextResponse } from "next/server";
import { isUsingStubModel } from "@/lib/ai/endpoint";

import { getRetrievalStore } from "@/lib/retrieval/store";
import { AI_CONFIG } from "@/lib/ai/config";

/**
 * Liveness and readiness.
 *
 * Reports what is actually true rather than what would be convenient. The index
 * either loaded or it did not; the model key is either present or it is not.
 * A health check that returns 200 while the thing it guards is broken is worse
 * than no health check, which is what this endpoint used to be — it probed a
 * database, a Firebase project and a ChromaDB server, none of which the
 * deployment has.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  try {
    const store = await getRetrievalStore();
    checks.index = {
      ok: store.meta.chunkCount > 0,
      detail: `${store.meta.chunkCount} chunks from ${store.meta.sectionCount} sections, ${store.meta.dimensions}d`,
    };
  } catch (error) {
    // The reason the index failed to load is a filesystem or deployment
    // detail. "ok: false" is the whole of what a caller needs; the rest is for
    // whoever reads the logs.
    console.error("[health] index failed to load:", error);
    checks.index = { ok: false, detail: "index failed to load" };
  }

  const hasKey = Boolean(process.env.GOOGLE_GEMINI_API_KEY);
  const stubbed = isUsingStubModel();
  checks.model = {
    // A stubbed process is not healthy in any sense a caller cares about. The
    // guard in endpoint.ts already makes this unreachable in a production
    // build, so this is the second line rather than the first: if a stub ever
    // does answer somewhere it should not, the health check should be the thing
    // that says so, loudly, rather than reporting "ok" because a key is set.
    ok: hasKey && !stubbed,
    // The key itself never appears here, only whether one is configured.
    detail: stubbed
      ? "ANSWERING FROM A LOCAL STUB — responses are fabricated and mean nothing"
      : hasKey
        ? `GOOGLE_GEMINI_API_KEY is set; model ${AI_CONFIG.gemini.model}`
        : "GOOGLE_GEMINI_API_KEY is not set, so every endpoint that calls a model will fail",
  };

  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, checkedAt: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
