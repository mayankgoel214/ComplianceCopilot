import { NextRequest, NextResponse } from "next/server";
import {
  initializeAgentSystem,
  getAgentRegistry,
  createProjectAgentTeam,
  IdeationInput,
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
      errorLogger.logEndpointError(parseError, "/api/agents/chat", body);
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
      userQuery,
      conversationHistory = [],
      context = {},
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
      !userQuery ||
      typeof userQuery !== "string" ||
      userQuery.trim().length === 0
    ) {
      validationErrors.push(
        "User query is required and must be a non-empty string"
      );
    }

    if (conversationHistory && !Array.isArray(conversationHistory)) {
      validationErrors.push("Conversation history must be an array");
    }

    if (context && typeof context !== "object") {
      validationErrors.push("Context must be an object");
    }

    if (validationErrors.length > 0) {
      errorLogger.logValidationError(validationErrors, {
        endpoint: "/api/agents/chat",
        projectId,
      });
      return NextResponse.json(
        {
          error: "Input validation failed",
          details: validationErrors,
          received: {
            projectId: projectId ? "provided" : "missing",
            userQuery: userQuery ? "provided" : "missing",
            hasConversationHistory: Array.isArray(conversationHistory),
            hasContext: typeof context === "object",
          },
        },
        { status: 400 }
      );
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

    // Find the ideation agent for this project
    const projectAgents = registry.discover({
      tags: [projectId],
      capabilities: ["knowledge_chat"],
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

    // Create properly structured chat context
    const chatContext = {
      projectId: projectId.trim(),
      userId: context.userId || "user-1", // Would come from auth in production
      sessionId: context.sessionId || `session-${Date.now()}`,
      conversationHistory: conversationHistory || [],
      sharedState: context.sharedState || {},
      preferences: context.preferences || {},
    };

    // Prepare ideation input for chat mode
    const ideationInput: IdeationInput = {
      mode: "chat",
      context: {
        projectDescription: (context.projectDescription || "").trim(),
        detectedFrameworks: context.detectedFrameworks || [],
        complianceGaps: context.complianceGaps || [],
        userQuery: userQuery.trim(),
      },
      conversationHistory: (conversationHistory || []).map(
        (msg: {
          role?: string;
          content?: string;
          timestamp?: string | number;
        }) => ({
          role: msg.role || "user",
          content: (msg.content || "").trim(),
          timestamp: new Date(msg.timestamp || Date.now()),
        })
      ),
    };

    try {
      // Execute the ideation agent in chat mode
      const chatResult = await registry.executeAgent(
        ideationAgent.metadata.id,
        ideationInput,
        chatContext
      );

      // Update conversation history
      const updatedHistory = [
        ...conversationHistory,
        {
          role: "user",
          content: userQuery,
          timestamp: new Date().toISOString(),
        },
        {
          role: "assistant",
          content: chatResult.response,
          timestamp: new Date().toISOString(),
          metadata: {
            sources: chatResult.sources,
            suggestedActions: chatResult.suggestedActions,
            relatedTopics: chatResult.relatedTopics,
          },
        },
      ];

      return NextResponse.json({
        success: true,
        projectId,
        response: chatResult.response,
        sources: chatResult.sources || [],
        suggestedActions: chatResult.suggestedActions || [],
        relatedTopics: chatResult.relatedTopics || [],
        conversationHistory: updatedHistory,
        metadata: {
          agentId: ideationAgent.metadata.id,
          timestamp: new Date().toISOString(),
          sessionId: chatContext.sessionId,
        },
      });
    } catch (agentError) {
      errorLogger.logError(agentError, {
        endpoint: "/api/agents/chat",
        projectId,
        operation: "chat_execution",
        agentId: ideationAgent?.metadata?.id,
      });

      return NextResponse.json(
        {
          error: "Chat processing failed",
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
    errorLogger.logEndpointError(error, "/api/agents/chat");

    return NextResponse.json(
      {
        error: "Chat request failed",
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
    const sessionId = searchParams.get("sessionId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
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

    // Find the ideation agent for this project
    const projectAgents = registry.discover({
      tags: [projectId],
      capabilities: ["knowledge_chat"],
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

    // Get agent status and conversation context
    const agentStatus = await registry.healthCheck(ideationAgent.metadata.id);

    return NextResponse.json({
      success: true,
      projectId,
      sessionId,
      agent: {
        id: ideationAgent.metadata.id,
        name: ideationAgent.metadata.name,
        status: ideationAgent.status,
        health: agentStatus[ideationAgent.metadata.id],
        capabilities: ideationAgent.metadata.capabilities
          .filter(
            (cap) => cap.name.includes("chat") || cap.name.includes("knowledge")
          )
          .map((cap) => cap.name),
      },
      chatFeatures: {
        knowledgeRetrieval: true,
        contextAwareness: true,
        sourceAttribution: true,
        suggestedActions: true,
        relatedTopics: true,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Chat status endpoint error:", error);
    return NextResponse.json(
      {
        error: "Failed to get chat status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
