import { NextRequest, NextResponse } from "next/server";
import { verifyTokenAndGetUser } from "@/lib/auth/auth-service";
import { getProjectsService } from "@/lib/db/projects-service";
import { getDocumentsService } from "@/lib/db/documents-service";
import { reportService } from "@/lib/services/report-service";
import {
  initializeAgentSystem,
  createProjectAgentTeam,
  getAgentRegistry,
  ClassificationInput,
  GraderInput,
  ImprovementInput,
} from "@/lib/agents";
import { errorLogger } from "@/lib/utils/error-logger";
import {
  ReportGenerationRequest,
  ReportGenerationResponse,
  ReportData
} from "@/lib/types/report-types";

// Initialize the agent system on first load
let systemInitialized = false;

async function ensureSystemInitialized() {
  if (!systemInitialized) {
    await initializeAgentSystem();
    systemInitialized = true;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureSystemInitialized();
    const { id: projectId } = await params;

    // Verify authentication
    const user = await verifyTokenAndGetUser(
      request.headers.get("authorization")
    );

    // Parse request body
    let body: ReportGenerationRequest;
    try {
      body = await request.json();
      // Ensure projectId matches URL parameter
      body.projectId = projectId;
    } catch (parseError) {
      errorLogger.logEndpointError(parseError, `/api/projects/${projectId}/reports`, body);
      return NextResponse.json(
        {
          error: "Invalid JSON in request body",
          details: parseError instanceof Error ? parseError.message : "Unknown parsing error",
        },
        { status: 400 }
      );
    }

    // Validate input
    const validationErrors: string[] = [];
    if (!projectId || typeof projectId !== "string") {
      validationErrors.push("Project ID is required");
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          error: "Input validation failed",
          details: validationErrors,
        },
        { status: 400 }
      );
    }

    // Verify user has access to the project
    const projectsService = getProjectsService();
    const project = await projectsService.getProjectById(projectId, user.id);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Get project documents
    const documentsService = getDocumentsService();
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    if (documents.length === 0) {
      return NextResponse.json(
        {
          error: "No documents found for analysis",
          details: "Please upload documents to the project before generating a report",
        },
        { status: 400 }
      );
    }

    // Build document content for analysis
    const documentContent = documents
      .map(doc => `Document: ${doc.name}\nType: ${doc.type}\nContent: ${doc.summary || doc.content || "No content available"}`)
      .join("\n\n");

    console.log('Document content for classification:', {
      projectDescription: project.description || "",
      documentCount: documents.length,
      documentContent: documentContent.substring(0, 500) + "...",
      totalContentLength: documentContent.length
    });

    // Create or get agent team for the project
    const registry = getAgentRegistry();
    let agentTeamIds: string[] = [];

    try {
      const existingAgents = registry.discover({ tags: [projectId] });
      if (existingAgents.length === 0) {
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

    // Create analysis context
    const analysisContext = {
      projectId: projectId.trim(),
      userId: user.id,
      sessionId: `report-session-${Date.now()}`,
      conversationHistory: [],
      sharedState: {},
      preferences: {},
    };

    const agentResults: any = {};

    try {
      // Step 1: Classification Analysis
      const classificationAgentId = agentTeamIds.find((id) =>
        id.includes("classification")
      );

      if (classificationAgentId) {
        const classificationInput: ClassificationInput = {
          projectDescription: project.description || "",
          documentContent,
          analysisDepth: body.analysisDepth || "thorough",
        };

        const classificationResult = await registry.executeAgent(
          classificationAgentId,
          classificationInput,
          analysisContext
        );

        console.log('Classification agent result:', JSON.stringify(classificationResult, null, 2));
        agentResults.classification = classificationResult;
      }

      // Step 2: Grading Analysis
      const graderAgentId = agentTeamIds.find((id) => id.includes("grader"));

      if (graderAgentId && agentResults.classification) {
        const frameworks = agentResults.classification.detectedFrameworks?.map((f: any) => ({
          name: f.name,
          confidence: f.confidence || 0.8,
          priority: f.priority || "medium",
        })) || [];

        if (frameworks.length > 0) {
          const graderInput: GraderInput = {
            frameworks,
            projectDocuments: [
              {
                id: "project-description",
                content: project.description || "",
                type: "other" as const,
              },
              ...documents.map(doc => ({
                id: doc.id,
                content: doc.summary || doc.content || "",
                type: (doc.type as any) || "other" as const,
              })),
            ],
            implementationDetails: {},
          };

          const graderResult = await registry.executeAgent(
            graderAgentId,
            graderInput,
            analysisContext
          );

          console.log('Grading agent result:', JSON.stringify(graderResult, null, 2));
          agentResults.grading = graderResult;
        }
      }

      // Step 3: Improvement Analysis
      const improvementAgentId = agentTeamIds.find((id) =>
        id.includes("improvement")
      );

      if (improvementAgentId && agentResults.grading) {
        const frameworkScores = agentResults.grading.frameworkScores || agentResults.grading.data?.frameworkScores || [];
        const prioritizedGaps = agentResults.grading.prioritizedGaps || agentResults.grading.data?.prioritizedGaps || [];

        if (frameworkScores.length > 0 || prioritizedGaps.length > 0) {
          const improvementInput: ImprovementInput = {
            frameworkScores,
            prioritizedGaps,
            projectContext: {
              type: "academic",
              size: "medium",
              budget: "moderate",
              timeline: "normal",
              resources: {
                technical: "medium",
                legal: "medium",
                administrative: "medium",
              },
            },
            preferences: {
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

          agentResults.improvement = improvementResult;
        }
      }

      // Generate comprehensive report data
      const reportData: ReportData = await reportService.generateReportData(
        projectId,
        agentResults,
        documents
      );

      return NextResponse.json({
        success: true,
        reportId: reportData.metadata.reportId,
        status: "completed" as const,
        progress: 100,
        data: reportData,
        metadata: {
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - analysisContext.sessionId.split('-')[2],
          agentsUsed: agentTeamIds.length,
          documentsAnalyzed: documents.length,
          frameworksDetected: reportData.frameworkScores.length,
        },
      });

    } catch (agentError) {
      errorLogger.logError(agentError, {
        endpoint: `/api/projects/${projectId}/reports`,
        projectId,
        operation: "report_generation",
        userId: user.id,
      });

      return NextResponse.json(
        {
          error: "Report generation failed",
          details: agentError instanceof Error ? agentError.message : "Unknown error",
          context: {
            projectId,
            agentTeamIds,
            partialResults: Object.keys(agentResults),
          },
        },
        { status: 500 }
      );
    }

  } catch (error) {
    errorLogger.logEndpointError(error, `/api/projects/${projectId}/reports`);

    return NextResponse.json(
      {
        error: "Report generation request failed",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Verify authentication
    const user = await verifyTokenAndGetUser(
      request.headers.get("authorization")
    );

    // Verify user has access to the project
    const projectsService = getProjectsService();
    const project = await projectsService.getProjectById(projectId, user.id);

    if (!project) {
      return NextResponse.json(
        { error: "Project not found or access denied" },
        { status: 404 }
      );
    }

    // Get project documents for status
    const documentsService = getDocumentsService();
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    // Check if report generation is possible
    const canGenerateReport = documents.length > 0;

    await ensureSystemInitialized();
    const registry = getAgentRegistry();

    // Get agent status for the project
    const projectAgents = registry.discover({ tags: [projectId] });
    const systemStatus = registry.getSystemStatus();

    return NextResponse.json({
      success: true,
      projectId,
      canGenerateReport,
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        documentCount: documents.length,
      },
      agents: projectAgents.map((agent) => ({
        id: agent.metadata.id,
        name: agent.metadata.name,
        status: agent.status,
        capabilities: agent.metadata.capabilities.map((cap) => cap.name),
      })),
      systemStatus,
      availableFeatures: {
        classification: true,
        grading: true,
        improvement: true,
        export: true,
        historicalTrends: false, // Would be true if historical data exists
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Report status endpoint error:", error);
    return NextResponse.json(
      {
        error: "Failed to get report status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}