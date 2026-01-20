import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    console.log("Step-by-step analyze endpoint called");

    const body = await request.json();
    console.log("Request body:", body);

    // Basic validation
    if (!body.projectId || !body.projectDescription) {
      return NextResponse.json(
        {
          error: "Project ID and description are required",
        },
        { status: 400 }
      );
    }

    // Step 1: Try to import the agent system
    console.log("Step 1: Importing agent system...");
    let agentSystem;
    try {
      agentSystem = await import("@/lib/agents");
      console.log("Step 1: Agent system imported successfully");
    } catch (error) {
      console.error("Step 1: Failed to import agent system:", error);
      return NextResponse.json(
        {
          error: "Failed to import agent system",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Step 2: Try to initialize the agent system
    console.log("Step 2: Initializing agent system...");
    try {
      await agentSystem.initializeAgentSystem();
      console.log("Step 2: Agent system initialized successfully");
    } catch (error) {
      console.error("Step 2: Failed to initialize agent system:", error);
      return NextResponse.json(
        {
          error: "Failed to initialize agent system",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    // Step 3: Try to get the agent registry
    console.log("Step 3: Getting agent registry...");
    let registry;
    try {
      registry = agentSystem.getAgentRegistry();
      console.log("Step 3: Agent registry obtained successfully");
    } catch (error) {
      console.error("Step 3: Failed to get agent registry:", error);
      return NextResponse.json(
        {
          error: "Failed to get agent registry",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Step-by-step analyze endpoint working",
      projectId: body.projectId,
      projectDescription: body.projectDescription,
      steps: {
        import: "success",
        initialize: "success",
        registry: "success",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Step-by-step analyze endpoint error:", error);
    return NextResponse.json(
      {
        error: "Step-by-step analyze endpoint failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
