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
      errorLogger.logEndpointError(parseError, "/api/agents/analyze", body);
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

    const {
      projectId,
      projectDescription,
      documentContent = "",
      analysisType = "full", // 'classification', 'ideation', 'grading', 'improvement', 'full'
      context = {},
      // Optional inputs for standalone agent testing
      classificationData = null, // For ideation and grader when running standalone
      frameworkData = null, // For grader when running standalone
      gradingData = null, // For improvement when running standalone
    } = body;

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

    if (
      analysisType &&
      ![
        "classification",
        "ideation",
        "grading",
        "improvement",
        "full",
      ].includes(analysisType)
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

    const results: Record<string, unknown> = {};

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

          results.classification = classificationResult;
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

          if (classificationSource || analysisType === "ideation") {
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
          let frameworks = [];

          // Use provided frameworkData first, then classificationData, then results
          if (frameworkData) {
            frameworks = Array.isArray(frameworkData)
              ? frameworkData
              : [frameworkData];
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
                  priority: f.priority || "medium",
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
                  priority: f.priority || "medium",
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
                  priority: f.priority,
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
                  priority: f.priority || "medium",
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
              implementationDetails: context.implementationDetails || {},
            };

            const graderResult = await registry.executeAgent(
              graderAgentId,
              graderInput,
              analysisContext
            );

            results.grading = graderResult;
          }
        }
      }

      if (analysisType === "improvement" || analysisType === "full") {
        // Step 4: Improvement (can use gradingData or results)
        const improvementAgentId = agentTeamIds.find((id) =>
          id.includes("improvement")
        );
        if (improvementAgentId) {
          let frameworkScores = [];
          let prioritizedGaps = [];

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
            // For standalone improvement testing, create default data
            frameworkScores = [
              {
                framework: "GDPR",
                overallScore: 65,
                maxScore: 100,
                percentage: 65,
                categoryScores: {
                  "Data Protection": { score: 60, maxScore: 100 },
                  "Privacy Rights": { score: 70, maxScore: 100 },
                },
              },
            ];
            prioritizedGaps = [
              {
                framework: "GDPR",
                category: "Data Protection",
                description: "Missing data encryption policies",
                severity: "high" as const,
                currentScore: 60,
                maxScore: 100,
                impact: 40,
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
