import { NextResponse } from "next/server";

import { ClassificationAgent } from "@/lib/agents/classification";
import { GraderAgent } from "@/lib/agents/grader";
import { checkRateLimit, visitorKeyFrom } from "@/lib/demo/rate-limit";
import {
  DEMO_DOCUMENT,
  DEMO_PROJECT_DESCRIPTION,
} from "@/lib/demo/fixture";

/**
 * Runs the real pipeline over the fixed demo document.
 *
 * Public on purpose — it is the only route that is. It takes no input at all:
 * the document is a constant, so a caller cannot enlarge the prompt, and the
 * only thing they can spend is a run, which the rate limiter bounds.
 *
 * Classification and grading, not the full five agents. Those two are what a
 * visitor can actually check against the document in front of them; ideation
 * produces follow-up questions, which reads as filler when nobody is going to
 * answer them, and costs another model call to produce.
 */
export const maxDuration = 60;

const PROJECT_ID = "public-demo";

export async function POST(request: Request) {
  const limit = checkRateLimit(visitorKeyFrom(request.headers));

  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
      {
        status: 429,
        headers: limit.retryAfterSeconds
          ? { "Retry-After": String(limit.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  const startedAt = Date.now();

  try {
    const context = {
      projectId: PROJECT_ID,
      sessionId: `demo-${startedAt}`,
      conversationHistory: [],
      sharedState: {},
      preferences: {},
    };

    const classifier = new ClassificationAgent(PROJECT_ID);
    await classifier.initialize();

    const classification = await classifier.execute({
      data: {
        projectDescription: DEMO_PROJECT_DESCRIPTION,
        documentContent: DEMO_DOCUMENT,
        analysisDepth: "quick" as const,
      },
      context,
    });

    const detected = classification?.data?.detectedFrameworks ?? [];

    if (detected.length === 0) {
      return NextResponse.json(
        {
          error:
            "The classifier returned no frameworks. That is a genuine failure rather than an empty result — the demo does not substitute canned output for it.",
        },
        { status: 502 }
      );
    }

    const grader = new GraderAgent(PROJECT_ID);
    await grader.initialize();

    const grading = await grader.execute({
      data: {
        frameworks: detected.map((f) => ({
          name: f.name,
          confidence: f.confidence,
          priority: f.priority,
        })),
        projectDocuments: [
          { id: "dmp", content: DEMO_DOCUMENT, type: "other" as const },
        ],
      },
      context,
    });

    return NextResponse.json({
      frameworks: detected.map((f) => ({
        name: f.name,
        confidence: f.confidence,
        priority: f.priority,
        reasoning: f.reasoning,
      })),
      overallScore: grading?.data?.overallComplianceScore ?? null,
      frameworkScores: (grading?.data?.frameworkScores ?? []).map((s) => ({
        framework: s.framework,
        overallScore: s.overallScore,
        readinessLevel: s.readinessLevel,
        gaps: (s.gaps ?? []).slice(0, 4).map((g) => ({
          requirement: g.requirement,
          severity: g.severity,
          evidence: g.evidence?.slice(0, 2) ?? [],
        })),
      })),
      elapsedMs: Date.now() - startedAt,
      runsRemainingThisHour: limit.remaining,
    });
  } catch (error) {
    // Reported rather than papered over. A demo that invents a result when the
    // model is unavailable is worse than one that admits it failed.
    console.error("Demo run failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "The analysis failed.",
      },
      { status: 500 }
    );
  }
}
