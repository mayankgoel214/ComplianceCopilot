import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";

import { getRetrievalStore } from "@/lib/retrieval/store";

/**
 * Index and evaluation metadata. No model call, so no rate limit — this is the
 * one public endpoint that costs nothing to serve.
 */
export const revalidate = 3600;

export async function GET() {
  try {
    const store = await getRetrievalStore();

    let evaluation: unknown = null;
    try {
      evaluation = JSON.parse(await readFile("eval/results.json", "utf8"));
    } catch {
      // The report is committed, but a build that has not run the harness is a
      // legitimate state and is reported as one rather than faked.
      evaluation = null;
    }

    const byFramework: Record<string, number> = {};
    for (const chunk of store.chunks) {
      byFramework[chunk.framework] = (byFramework[chunk.framework] ?? 0) + 1;
    }

    return NextResponse.json({
      index: { ...store.meta, vocabularySize: store.vocabularySize, chunksByFramework: byFramework },
      evaluation,
    });
  } catch (error) {
    console.error("[index-stats] failed:", error);
    console.error("index-stats failed:", error);
    return NextResponse.json(
      { error: "Could not load the index." },
      { status: 500 }
    );
  }
}
