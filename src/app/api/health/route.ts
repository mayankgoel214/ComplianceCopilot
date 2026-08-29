import { NextResponse } from "next/server";

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
    checks.index = {
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 200) : "index failed to load",
    };
  }

  const hasKey = Boolean(process.env.GOOGLE_GEMINI_API_KEY);
  checks.model = {
    ok: hasKey,
    // The key itself never appears here, only whether one is configured.
    detail: hasKey
      ? `GOOGLE_GEMINI_API_KEY is set; model ${AI_CONFIG.gemini.model}`
      : "GOOGLE_GEMINI_API_KEY is not set, so every endpoint that calls a model will fail",
  };

  const healthy = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { status: healthy ? "healthy" : "degraded", checks, checkedAt: new Date().toISOString() },
    { status: healthy ? 200 : 503 }
  );
}
