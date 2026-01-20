import { NextRequest, NextResponse } from "next/server";
import {
  initializeAgentSystem,
  createProjectAgentTeam,
  getAgentRegistry,
  IdeationInput,
} from "@/lib/agents";
import { verifyTokenAndGetUser } from "@/lib/auth/auth-service";
import { getProjectsService } from "@/lib/db/projects-service";
import { getDocumentsService } from "@/lib/db/documents-service";
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

    // Verify authentication
    const user = await verifyTokenAndGetUser(
      request.headers.get("authorization")
    );

    // Parse and validate request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch (parseError) {
      errorLogger.logEndpointError(parseError, "/api/agents/questions", body);
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
      maxQuestions = 5,
      context = {},
    } = body;

    // Enhanced input validation
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
      maxQuestions &&
      (typeof maxQuestions !== "number" || maxQuestions < 1 || maxQuestions > 20)
    ) {
      validationErrors.push(
        "Max questions must be a number between 1 and 20"
      );
    }

    if (validationErrors.length > 0) {
      errorLogger.logValidationError(validationErrors, {
        endpoint: "/api/agents/questions",
        projectId,
        userId: user.id,
      });
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

    // Get project documents for context
    const documentsService = getDocumentsService();
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    // Build document content summary
    let documentContent = "";
    if (documents.length > 0) {
      documentContent = documents
        .map(doc => `Document: ${doc.name}\nType: ${doc.type}\nSummary: ${doc.summary || "No summary available"}`)
        .join("\n\n");
    }

    const registry = getAgentRegistry();

    // Ensure agent team exists for the project
    try {
      const existingAgents = registry.discover({ tags: [projectId] });
      if (existingAgents.length === 0) {
        await createProjectAgentTeam(projectId);
        console.log(`Created agent team for project ${projectId}`);
      }
    } catch (error) {
      console.error("Error ensuring agent team:", error);
      return NextResponse.json(
        { error: "Failed to initialize agent team" },
        { status: 500 }
      );
    }

    // First, run the classification agent to get fresh framework detection
    let detectedFrameworks: string[] = context.detectedFrameworks || [];
    let complianceGaps: string[] = context.complianceGaps || [];

    try {
      // Find the classification agent for this project
      const classificationAgents = registry.discover({
        tags: [projectId],
        capabilities: ["framework_detection"],
      });

      const classificationAgent = classificationAgents.find((agent) =>
        agent.metadata.id.includes("classification")
      );

      if (classificationAgent) {
        console.log(`Running classification agent before question generation for project ${projectId}`);

        const classificationInput = {
          projectDescription: project.description || "",
          documentContent,
          existingFrameworks: context.detectedFrameworks || [],
          analysisDepth: "thorough" as const,
        };

        const classificationResult = await registry.executeAgent(
          classificationAgent.metadata.id,
          classificationInput,
          {
            projectId: projectId.trim(),
            userId: user.id,
            sessionId: `classification-session-${Date.now()}`,
            conversationHistory: [],
            sharedState: {
              projectDescription: project.description || "",
              documentContent,
              documentCount: documents.length,
            },
            preferences: {},
          }
        );

        if (classificationResult?.detectedFrameworks) {
          detectedFrameworks = classificationResult.detectedFrameworks.map((f: any) => f.name);
          console.log(`Classification agent detected frameworks: ${detectedFrameworks.join(', ')}`);
        }
      } else {
        console.log(`No classification agent found for project ${projectId}, using existing frameworks`);
      }
    } catch (classificationError) {
      console.error("Classification agent execution failed:", classificationError);
      // Continue with existing frameworks if classification fails
    }

    // Find the ideation agent for this project
    const projectAgents = registry.discover({
      tags: [projectId],
      capabilities: ["question_generation"],
    });

    const ideationAgent = projectAgents.find((agent) =>
      agent.metadata.id.includes("ideation")
    );

    if (!ideationAgent) {
      return NextResponse.json(
        { error: "Ideation agent not found for this project" },
        { status: 404 }
      );
    }

    // Create context for the agent
    const agentContext = {
      projectId: projectId.trim(),
      userId: user.id,
      sessionId: `questions-session-${Date.now()}`,
      conversationHistory: [],
      sharedState: {
        projectDescription: project.description || "",
        documentContent,
        documentCount: documents.length,
        ...context,
      },
      preferences: {},
    };

    // Prepare ideation input for questions mode
    const ideationInput: IdeationInput = {
      mode: "questions",
      context: {
        projectDescription: project.description || "",
        detectedFrameworks: context.detectedFrameworks || [],
        complianceGaps: context.complianceGaps || [],
      },
      maxQuestions: maxQuestions as number,
    };

    try {
      // Execute the ideation agent to generate questions
      // With retry logic for busy agents
      let questionResult;
      let retryCount = 0;
      const maxRetries = 3;
      const retryDelay = 1000; // Start with 1 second

      while (retryCount < maxRetries) {
        try {
          questionResult = await registry.executeAgent(
            ideationAgent.metadata.id,
            ideationInput,
            agentContext
          );
          break; // Success, exit the retry loop
        } catch (execError) {
          const errorMessage = execError instanceof Error ? execError.message : '';

          // Check if it's a busy error
          if (errorMessage.includes('busy') && retryCount < maxRetries - 1) {
            retryCount++;
            console.log(`Agent busy, retrying (${retryCount}/${maxRetries}) after ${retryDelay * retryCount}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay * retryCount));
            continue;
          }

          // If not a busy error or max retries reached, throw the error
          throw execError;
        }
      }

      // Check if we got a valid result
      if (!questionResult) {
        throw new Error("No result returned from ideation agent");
      }

      // Transform the result to match frontend expectations
      const transformedQuestions = questionResult.questions?.map((q: {
        id?: string;
        question?: string;
        text?: string;
        expectedAnswerType?: string;
        category?: string;
        priority?: string;
        framework?: string;
        reasoning?: string;
      }, index: number) => ({
        id: q.id || `question-${index + 1}`,
        text: q.question || q.text,
        type: mapAnswerTypeToUIType(q.expectedAnswerType),
        category: q.category,
        priority: q.priority,
        framework: q.framework,
        reasoning: q.reasoning,
        options: generateOptionsForType(q.expectedAnswerType, q.category),
        timestamp: new Date(),
        answer: undefined, // No answer initially
      })) || [];

      return NextResponse.json({
        success: true,
        projectId,
        questions: transformedQuestions,
        metadata: {
          agentId: ideationAgent.metadata.id,
          timestamp: new Date().toISOString(),
          sessionId: agentContext.sessionId,
          strategy: questionResult.questioningStrategy || {},
          documentCount: documents.length,
          totalGenerated: transformedQuestions.length,
        },
      });
    } catch (agentError) {
      errorLogger.logError(agentError, {
        endpoint: "/api/agents/questions",
        projectId,
        operation: "question_generation",
        agentId: ideationAgent?.metadata?.id,
        userId: user.id,
      });

      return NextResponse.json(
        {
          error: "Question generation failed",
          details:
            agentError instanceof Error ? agentError.message : "Unknown error",
          context: {
            projectId,
            agentId: ideationAgent?.metadata?.id,
          },
        },
        { status: 500 }
      );
    }
  } catch (error) {
    errorLogger.logEndpointError(error, "/api/agents/questions");

    return NextResponse.json(
      {
        error: "Question generation request failed",
        details: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const user = await verifyTokenAndGetUser(
      request.headers.get("authorization")
    );

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
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

    // Get project documents for context info
    const documentsService = getDocumentsService();
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    await ensureSystemInitialized();
    const registry = getAgentRegistry();

    // Find the ideation agent for this project
    const projectAgents = registry.discover({
      tags: [projectId],
      capabilities: ["question_generation"],
    });

    const ideationAgent = projectAgents.find((agent) =>
      agent.metadata.id.includes("ideation")
    );

    if (!ideationAgent) {
      return NextResponse.json(
        { error: "Ideation agent not found for this project" },
        { status: 404 }
      );
    }

    // Get agent status
    const agentStatus = await registry.healthCheck(ideationAgent.metadata.id);

    return NextResponse.json({
      success: true,
      projectId,
      agent: {
        id: ideationAgent.metadata.id,
        name: ideationAgent.metadata.name,
        status: ideationAgent.status,
        health: agentStatus[ideationAgent.metadata.id],
      },
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        documentCount: documents.length,
      },
      questionGeneration: {
        available: true,
        maxQuestions: 20,
        supportedTypes: ["text", "boolean", "choice", "numeric"],
        categories: ["implementation", "gap_filling", "risk_clarification", "process"],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Question generation status endpoint error:", error);
    return NextResponse.json(
      {
        error: "Failed to get question generation status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper functions
function mapAnswerTypeToUIType(agentType: string): string {
  const typeMap: Record<string, string> = {
    text: "text",
    boolean: "boolean",
    choice: "multiple-choice",
    numeric: "number",
  };
  return typeMap[agentType] || "text";
}

function generateOptionsForType(answerType: string, category: string): string[] | undefined {
  if (answerType === "boolean") {
    return ["Yes", "No"];
  }

  if (answerType === "choice") {
    // Generate contextual options based on category
    switch (category) {
      case "implementation":
        return ["Not Started", "In Progress", "Completed", "Not Applicable"];
      case "risk_clarification":
        return ["Low Risk", "Medium Risk", "High Risk", "Critical Risk"];
      case "gap_filling":
        return ["Fully Compliant", "Partially Compliant", "Non-Compliant", "Unknown"];
      case "process":
        return ["Manual", "Semi-Automated", "Fully Automated", "Not Defined"];
      default:
        return ["Option 1", "Option 2", "Option 3", "Other"];
    }
  }

  return undefined;
}