import { NextRequest, NextResponse } from "next/server";
import {
  initializeAgentSystem,
  createProjectAgentTeam,
  getAgentRegistry,
  ClassificationInput,
  IdeationInput,
  GraderInput,
  ImprovementInput,
} from "@/lib/agents";
import { errorLogger } from "@/lib/utils/error-logger";
import type { ClassificationOutput, GraderOutput } from "@/lib/agents";

// Initialize the agent system on first load
let systemInitialized = false;

async function ensureSystemInitialized() {
  if (!systemInitialized) {
    await initializeAgentSystem();
    systemInitialized = true;
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    // Parse and validate request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (parseError) {
      // Not `body` — it is by definition unassigned here, which is what the
      // parse failed to produce. Logging the raw text is what actually helps
      // diagnose a malformed payload.
      errorLogger.logEndpointError(parseError, "/api/agents/analyze", {
        reason: "request body was not valid JSON",
      });
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
          details:
            parseError instanceof Error
              ? parseError.message
              : "Unknown parsing error",
        },
        { status: 400 }
      );
    }

    // One assertion, here at the boundary, immediately followed by the
    // validation that makes it true. Destructuring straight off
    // Record<string, unknown> instead left every field `unknown` and pushed a
    // cast into each of the dozen places they were used.
    /**
     * A prior stage's output as it actually arrives.
     *
     * Callers forward either the agent's payload directly or the whole
     * envelope it came in, and the code below already handles both with
     * `x.field || x.data?.field`. Naming that shape here is what makes those
     * accesses type-check without rewriting working logic. Partial, because a
     * caller running one stage standalone supplies only what that stage needs.
     */
    type PriorStage<T> = Partial<T> & { data?: Partial<T> };

    type AnalysisType =
      | "classification"
      | "ideation"
      | "grading"
      | "improvement"
      | "full";

    interface AnalyzeRequest {
      projectId?: string;
      projectDescription?: string;
      documentContent?: string;
      analysisType?: AnalysisType;
      /**
       * Caller-supplied project context. Every field is optional and each use
       * below falls back to a default, which is why these are unions of the
       * literals the downstream agents accept rather than plain strings — a
       * typo in a caller's payload should fail here, not inside an agent.
       */
      context?: {
        projectType?: "academic" | "research" | "government" | "commercial";
        projectSize?: "small" | "medium" | "large";
        budget?: "limited" | "moderate" | "ample";
        timeline?: "urgent" | "normal" | "flexible";
        technicalResources?: "low" | "medium" | "high";
        legalResources?: "low" | "medium" | "high";
        administrativeResources?: "low" | "medium" | "high";
        preferences?: {
          prioritizeQuickWins: boolean;
          focusOnCritical: boolean;
          includeTraining: boolean;
          includeAutomation: boolean;
        };
        implementationDetails?: {
          existingPolicies: string[];
          securityMeasures: string[];
          dataHandlingPractices: string[];
          accessControls: string[];
        };
        userId?: string;
        sessionId?: string;
        conversationHistory?: unknown[];
        sharedState?: Record<string, unknown>;
        existingPolicies?: string[];
        securityMeasures?: string[];
        dataHandlingPractices?: string[];
        accessControls?: string[];
      };
      /**
       * Outputs from earlier agents, passed back in when a caller runs one
       * stage standalone. Typed as the agents' own output shapes rather than
       * `unknown`, since that is exactly what they are.
       */
      classificationData?: PriorStage<ClassificationOutput> | null;
      frameworkData?: PriorStage<ClassificationOutput> | null;
      gradingData?: PriorStage<GraderOutput> | null;
    }

    const {
      // Defaulted to "" rather than left possibly-undefined: the validation
      // below already rejects an empty string, so this keeps the behaviour
      // identical while letting the type stay `string` for every use after it.
      projectId = "",
      projectDescription = "",
      documentContent = "",
      analysisType = "full" as AnalysisType, // 'classification', 'ideation', 'grading', 'improvement', 'full'
      context = {},
      // Optional inputs for standalone agent testing
      classificationData = null, // For ideation and grader when running standalone
      frameworkData = null, // For grader when running standalone
      gradingData = null, // For improvement when running standalone
    } = body as AnalyzeRequest;

    // Enhanced input validation with detailed error messages
    const validationErrors: string[] = [];

    if (
      !projectId ||
      typeof projectId !== "string" ||
      projectId.trim().length === 0
    ) {
      validationErrors.push(
        "Project ID is required and must be a non-empty string"
      );
    }

    if (
      !projectDescription ||
      typeof projectDescription !== "string" ||
      projectDescription.trim().length === 0
    ) {
      validationErrors.push(
        "Project description is required and must be a non-empty string"
      );
    }

    if (documentContent && typeof documentContent !== "string") {
      validationErrors.push("Document content must be a string");
    }

    // Narrowed against the tuple rather than cast: the body arrives as
    // Record<string, unknown>, so this is the point where an untrusted value
    // becomes a known one.
    const ANALYSIS_TYPES = [
      "classification",
      "ideation",
      "grading",
      "improvement",
      "full",
    ] as const;

    if (
      analysisType &&
      !ANALYSIS_TYPES.includes(analysisType as (typeof ANALYSIS_TYPES)[number])
    ) {
      validationErrors.push(
        "Analysis type must be one of: classification, ideation, grading, improvement, full"
      );
    }

    if (validationErrors.length > 0) {
      errorLogger.logValidationError(validationErrors, {
        endpoint: "/api/agents/analyze",
        projectId,
        analysisType,
      });
      return NextResponse.json(
        {
          error: "Input validation failed",
          details: validationErrors,
          received: {
            projectId: projectId ? "provided" : "missing",
            projectDescription: projectDescription ? "provided" : "missing",
            analysisType,
            hasContext: !!context,
          },
        },
        { status: 400 }
      );
    }

    // Create or get agent team for the project
    const registry = getAgentRegistry();
    let agentTeamIds: string[] = [];

    try {
      // Try to find existing agents for this project
      const existingAgents = registry.discover({
        tags: [projectId],
      });

      if (existingAgents.length === 0) {
        // Create new agent team
        agentTeamIds = await createProjectAgentTeam(projectId);
      } else {
        agentTeamIds = existingAgents.map((agent) => agent.metadata.id);
      }
    } catch (error) {
      console.error("Error managing agent team:", error);
      return NextResponse.json(
        { error: "Failed to initialize agent team" },
        { status: 500 }
      );
    }

    // Create properly structured analysis context
    const analysisContext = {
      projectId: projectId.trim(),
      userId: context.userId || "user-1", // Would come from auth in production
      sessionId: context.sessionId || `session-${Date.now()}`,
      conversationHistory: context.conversationHistory || [],
      sharedState: context.sharedState || {},
      preferences: context.preferences || {},
    };

    // Stages read each other's output back off this, so it carries the shapes
    // rather than `unknown` — `results.classification` was typed `{}`, which
    // made every property access on it an error.
    const results: {
      classification?: PriorStage<ClassificationOutput>;
      ideation?: unknown;
      grading?: PriorStage<GraderOutput>;
      improvement?: unknown;
      validation?: unknown;
    } = {};

    try {
      if (analysisType === "classification" || analysisType === "full") {
        // Step 1: Classification
        const classificationAgentId = agentTeamIds.find((id) =>
          id.includes("classification")
        );
        if (classificationAgentId) {
          const classificationInput: ClassificationInput = {
            projectDescription: projectDescription.trim(),
            documentContent: (documentContent || "").trim(),
            analysisDepth: "thorough",
          };

          const classificationResult = await registry.executeAgent(
            classificationAgentId,
            classificationInput,
            analysisContext
          );

          results.classification =
            classificationResult as PriorStage<ClassificationOutput>;
        }
      }

      if (analysisType === "ideation" || analysisType === "full") {
        // Step 2: Ideation (Questions)
        const ideationAgentId = agentTeamIds.find((id) =>
          id.includes("ideation")
        );
        if (ideationAgentId) {
          // Use provided classificationData or results from previous step
          const classificationSource =
            classificationData || results.classification;

          // Was `classificationSource || analysisType === "ideation"`, which
          // made the standalone-ideation branch below unreachable: getting there
          // required analysisType !== "ideation", the very thing it tested for.
          // Standalone runs therefore fell in here and proceeded with an empty
          // framework list instead of the defaults written for them.
          if (classificationSource) {
            const detectedFrameworks =
              classificationSource?.detectedFrameworks?.map(
                (f: { name: string }) => f.name
              ) ||
              classificationSource?.data?.detectedFrameworks?.map(
                (f: { name: string }) => f.name
              ) ||
              [];

            const ideationInput: IdeationInput = {
              mode: "questions",
              context: {
                projectDescription: projectDescription.trim(),
                detectedFrameworks,
                complianceGaps: [],
              },
              maxQuestions: 5,
            };

            const ideationResult = await registry.executeAgent(
              ideationAgentId,
              ideationInput,
              analysisContext
            );

            results.ideation = ideationResult;
          } else if (analysisType === "ideation") {
            // For standalone ideation testing, create default input
            const ideationInput: IdeationInput = {
              mode: "questions",
              context: {
                projectDescription: projectDescription.trim(),
                detectedFrameworks: ["GDPR", "SOX"], // Default frameworks for testing
                complianceGaps: [],
              },
              maxQuestions: 5,
            };

            const ideationResult = await registry.executeAgent(
              ideationAgentId,
              ideationInput,
              analysisContext
            );

            results.ideation = ideationResult;
          }
        }
      }

      if (analysisType === "grading" || analysisType === "full") {
        // Step 3: Grading (can use frameworkData, classificationData, or results)
        const graderAgentId = agentTeamIds.find((id) => id.includes("grader"));
        if (graderAgentId) {
          // Annotated because the branches below populate it from three
          // different sources; without this it infers any[] from the empty
          // literal and every later use is untyped.
          let frameworks: Array<{
            name: string;
            confidence: number;
            priority: "low" | "medium" | "high" | "critical";
          }> = [];

          // Use provided frameworkData first, then classificationData, then results
          if (frameworkData) {
            // Supplied directly by the caller when running the grader
            // standalone, either as one framework or a list.
            frameworks = (
              Array.isArray(frameworkData) ? frameworkData : [frameworkData]
            ) as typeof frameworks;
          } else if (classificationData) {
            frameworks =
              classificationData.detectedFrameworks?.map(
                (f: {
                  name: string;
                  confidence?: number;
                  priority?: string;
                }) => ({
                  name: f.name,
                  confidence: f.confidence || 0.8,
                  priority: (f.priority as typeof frameworks[number]["priority"]) || "medium",
                })
              ) ||
              classificationData.data?.detectedFrameworks?.map(
                (f: {
                  name: string;
                  confidence?: number;
                  priority?: string;
                }) => ({
                  name: f.name,
                  confidence: f.confidence || 0.8,
                  priority: (f.priority as typeof frameworks[number]["priority"]) || "medium",
                })
              ) ||
              [];
          } else if (results.classification) {
            frameworks =
              results.classification.detectedFrameworks?.map(
                (f: {
                  name: string;
                  confidence: number;
                  priority: string;
                }) => ({
                  name: f.name,
                  confidence: f.confidence,
                  // The grader accepts only these four; anything else the
                  // classifier reports falls back rather than widening the type.
                  priority: (f.priority as (typeof frameworks)[number]["priority"]) || "medium",
                })
              ) ||
              results.classification.data?.detectedFrameworks?.map(
                (f: {
                  name: string;
                  confidence?: number;
                  priority?: string;
                }) => ({
                  name: f.name,
                  confidence: f.confidence || 0.8,
                  priority: (f.priority as typeof frameworks[number]["priority"]) || "medium",
                })
              ) ||
              [];
          } else if (analysisType === "grading") {
            // For standalone grading testing, create default frameworks
            frameworks = [
              { name: "GDPR", confidence: 0.9, priority: "high" },
              { name: "SOX", confidence: 0.8, priority: "medium" },
            ];
          }

          if (frameworks.length > 0 || analysisType === "grading") {
            const graderInput: GraderInput = {
              frameworks,
              projectDocuments: [
                {
                  id: "project-description",
                  content: projectDescription.trim(),
                  type: "other" as const,
                },
              ],
              implementationDetails: context.implementationDetails,
            };

            const graderResult = await registry.executeAgent(
              graderAgentId,
              graderInput,
              analysisContext
            );

            results.grading = graderResult as PriorStage<GraderOutput>;
          }
        }
      }

      if (analysisType === "improvement" || analysisType === "full") {
        // Step 4: Improvement (can use gradingData or results)
        const improvementAgentId = agentTeamIds.find((id) =>
          id.includes("improvement")
        );
        if (improvementAgentId) {
          // Annotated for the same reason as `frameworks` above: populated
          // from several branches, so an empty literal would infer any[].
          let frameworkScores: NonNullable<GraderOutput["frameworkScores"]> = [];
          let prioritizedGaps: NonNullable<GraderOutput["prioritizedGaps"]> = [];

          // Use provided gradingData first, then results
          if (gradingData) {
            frameworkScores =
              gradingData.frameworkScores ||
              gradingData.data?.frameworkScores ||
              [];
            prioritizedGaps =
              gradingData.prioritizedGaps ||
              gradingData.data?.prioritizedGaps ||
              [];
          } else if (results.grading) {
            frameworkScores =
              results.grading.frameworkScores ||
              results.grading.data?.frameworkScores ||
              [];
            prioritizedGaps =
              results.grading.prioritizedGaps ||
              results.grading.data?.prioritizedGaps ||
              [];
          } else if (analysisType === "improvement") {
            // Placeholder input so the improvement agent can be exercised on
            // its own, without first running classification and grading.
            //
            // It was previously written in a shape the grader never produces —
            // maxScore, percentage, categoryScores — none of which exist on
            // FrameworkScore or ComplianceGap. Anything downstream reading a
            // real score off it found undefined. Now it matches the contract,
            // and the numbers are still invented, which is why this branch runs
            // only for a standalone improvement request.
            frameworkScores = [
              {
                framework: "GDPR",
                overallScore: 65,
                breakdown: {
                  dataProtection: 60,
                  accessControls: 65,
                  documentation: 70,
                  procedures: 65,
                  monitoring: 65,
                },
                gaps: [],
                strengths: [],
                criticalIssues: [],
                readinessLevel: "partially_ready",
              },
            ];
            prioritizedGaps = [
              {
                requirement: "Data encryption at rest and in transit",
                framework: "GDPR",
                severity: "high",
                currentStatus: "missing",
                evidence: [],
                impact: "Personal data is not protected against disclosure",
                effort: "medium",
              },
            ];
          }

          if (
            frameworkScores.length > 0 ||
            prioritizedGaps.length > 0 ||
            analysisType === "improvement"
          ) {
            const improvementInput: ImprovementInput = {
              frameworkScores,
              prioritizedGaps,
              projectContext: {
                type: context.projectType || "academic",
                size: context.projectSize || "medium",
                budget: context.budget || "moderate",
                timeline: context.timeline || "normal",
                resources: {
                  technical: context.technicalResources || "medium",
                  legal: context.legalResources || "medium",
                  administrative: context.administrativeResources || "medium",
                },
              },
              preferences: context.preferences || {
                prioritizeQuickWins: true,
                focusOnCritical: true,
                includeTraining: true,
                includeAutomation: false,
              },
            };

            const improvementResult = await registry.executeAgent(
              improvementAgentId,
              improvementInput,
              analysisContext
            );

            results.improvement = improvementResult;
          }
        }
      }

      // Return comprehensive analysis results
      return NextResponse.json({
        success: true,
        projectId,
        analysisType,
        agentTeamIds,
        results,
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now(),
          agentsUsed: agentTeamIds.length,
        },
      });
    } catch (agentError) {
      errorLogger.logError(agentError, {
        endpoint: "/api/agents/analyze",
        projectId,
        operation: "agent_execution",
        input: { analysisType, partialResults: results },
      });

      return NextResponse.json(
        {
          error: "Agent execution failed",
          details:
            agentError instanceof Error ? agentError.message : "Unknown error",
          partialResults: results,
          context: {
            projectId,
            analysisType,
            agentTeamIds,
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    errorLogger.logEndpointError(error, "/api/agents/analyze");

    return NextResponse.json(
      {
        error: "Analysis failed",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    const registry = getAgentRegistry();

    // Get agent status for the project
    const projectAgents = registry.discover({
      tags: [projectId],
    });

    // Get system status
    const systemStatus = registry.getSystemStatus();

    // Get health status for project agents
    const healthStatus = await registry.healthCheck();
    const projectHealth = Object.fromEntries(
      Object.entries(healthStatus).filter(([agentId]) =>
        projectAgents.some((agent) => agent.metadata.id === agentId)
      )
    );

    return NextResponse.json({
      success: true,
      projectId,
      agents: projectAgents.map((agent) => ({
        id: agent.metadata.id,
        name: agent.metadata.name,
        status: agent.status,
        capabilities: agent.metadata.capabilities.map((cap) => cap.name),
        usageStats: agent.usageStats,
      })),
      systemStatus,
      health: projectHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Agent status endpoint error:", error);
    return NextResponse.json(
      {
        error: "Failed to get agent status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
