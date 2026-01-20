import { NextRequest, NextResponse } from "next/server";
import {
  initializeAgentSystem,
  createProjectAgentTeam,
  getAgentRegistry,
} from "@/lib/agents";
import { getWorkflowOrchestrator } from "@/lib/agents/orchestrator";

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

    const body = await request.json();
    const {
      workflowId = "full_compliance_analysis",
      projectId,
      projectDescription,
      documentContent = "",
      context = {},
      analysisDepth = "thorough",
    } = body;

    if (!projectId || !projectDescription) {
      return NextResponse.json(
        { error: "Project ID and description are required" },
        { status: 400 }
      );
    }

    const orchestrator = getWorkflowOrchestrator();
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

    // Create workflow context
    const workflowContext = {
      projectId,
      userId: "user-1", // Would come from auth in production
      sessionId: `workflow-session-${Date.now()}`,
      conversationHistory: [],
      sharedState: {
        projectDescription,
        documentContent,
        analysisDepth,
        ...context,
      },
      preferences: {},
    };

    // Prepare initial input for the workflow
    const initialInput = {
      projectDescription,
      documentContent,
      analysisDepth,
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

    try {
      // Execute the workflow
      const workflowResult = await orchestrator.executeWorkflow(
        workflowId,
        projectId,
        workflowContext,
        initialInput
      );

      return NextResponse.json({
        success: true,
        executionId: workflowResult.executionId,
        workflowId,
        projectId,
        results: workflowResult.results,
        summary: workflowResult.summary,
        metrics: workflowResult.metrics,
        errors: workflowResult.errors,
        metadata: {
          timestamp: new Date().toISOString(),
          totalExecutionTime: workflowResult.summary.totalTime,
          stepsExecuted: workflowResult.summary.stepsExecuted,
          successRate: workflowResult.summary.successRate,
        },
      });
    } catch (workflowError) {
      console.error("Workflow execution error:", workflowError);
      return NextResponse.json(
        {
          error: "Workflow execution failed",
          details:
            workflowError instanceof Error
              ? workflowError.message
              : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Workflow endpoint error:", error);
    return NextResponse.json(
      {
        error: "Workflow request failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get("executionId");
    const listWorkflows = searchParams.get("list") === "true";

    const orchestrator = getWorkflowOrchestrator();

    if (listWorkflows) {
      // List available workflows
      const workflows = orchestrator.listWorkflows();

      return NextResponse.json({
        success: true,
        workflows: workflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          executionMode: workflow.executionMode,
          stepCount: workflow.steps.length,
          estimatedDuration: estimateWorkflowDuration(workflow),
          errorHandling: workflow.errorHandling,
        })),
      });
    }

    if (executionId) {
      // Get specific execution status
      const execution = orchestrator.getExecutionStatus(executionId);

      if (!execution) {
        return NextResponse.json(
          { error: "Execution not found" },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        execution: {
          id: execution.id,
          workflowId: execution.workflowId,
          projectId: execution.projectId,
          status: execution.status,
          startTime: execution.startTime,
          endTime: execution.endTime,
          metrics: execution.metrics,
          stepStatus: Object.fromEntries(execution.stepStatus),
          stepErrors: Object.fromEntries(
            Array.from(execution.stepErrors.entries()).map(([key, errors]) => [
              key,
              errors.map((error) => error.message),
            ])
          ),
        },
      });
    }

    // Get monitoring data
    const getMetrics = searchParams.get("metrics") === "true";
    const getStatuses = searchParams.get("statuses") === "true";
    const getHistory = searchParams.get("history") === "true";

    if (getMetrics) {
      const metrics = orchestrator.getMetrics();
      return NextResponse.json({
        success: true,
        metrics,
      });
    }

    if (getStatuses) {
      const statuses = orchestrator.getExecutionStatuses();
      return NextResponse.json({
        success: true,
        executions: statuses,
      });
    }

    if (getHistory) {
      const limit = parseInt(searchParams.get("limit") || "50");
      const history = orchestrator.getExecutionHistory(limit);
      return NextResponse.json({
        success: true,
        history,
      });
    }

    // General workflow system status
    return NextResponse.json({
      success: true,
      system: {
        initialized: systemInitialized,
        availableWorkflows: orchestrator.listWorkflows().length,
      },
      features: {
        sequentialExecution: "Execute agents in defined order",
        parallelExecution: "Execute independent agents simultaneously",
        hybridExecution: "Combination of sequential and parallel execution",
        errorRecovery: "Automatic retry and error handling",
        progressTracking: "Real-time execution monitoring",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Workflow status endpoint error:", error);
    return NextResponse.json(
      {
        error: "Failed to get workflow status",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get("executionId");

    if (!executionId) {
      return NextResponse.json(
        { error: "Execution ID is required" },
        { status: 400 }
      );
    }

    const orchestrator = getWorkflowOrchestrator();

    try {
      await orchestrator.cancelWorkflow(executionId);

      return NextResponse.json({
        success: true,
        message: "Workflow execution cancelled",
        executionId,
      });
    } catch (cancelError) {
      return NextResponse.json(
        {
          error: "Failed to cancel workflow",
          details:
            cancelError instanceof Error
              ? cancelError.message
              : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Workflow cancellation endpoint error:", error);
    return NextResponse.json(
      {
        error: "Workflow cancellation request failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await ensureSystemInitialized();

    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get("executionId");

    if (!executionId) {
      return NextResponse.json(
        { error: "Execution ID is required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action, options = {} } = body;

    const orchestrator = getWorkflowOrchestrator();

    try {
      let result;

      switch (action) {
        case "recover":
          result = await orchestrator.recoverWorkflow(executionId, options);
          break;
        default:
          return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: true,
        message: `Workflow ${action} completed`,
        executionId,
        result,
      });
    } catch (actionError) {
      return NextResponse.json(
        {
          error: `Failed to ${action} workflow`,
          details:
            actionError instanceof Error
              ? actionError.message
              : "Unknown error",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Workflow action endpoint error:", error);
    return NextResponse.json(
      {
        error: "Workflow action request failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Helper function to estimate workflow duration
function estimateWorkflowDuration(workflow: any): string {
  const totalTimeout = workflow.steps.reduce(
    (sum: number, step: any) => sum + step.timeout,
    0
  );
  const minutes = Math.ceil(totalTimeout / 60000);

  if (minutes < 1) return "< 1 minute";
  if (minutes === 1) return "1 minute";
  if (minutes < 60) return `${minutes} minutes`;

  const hours = Math.ceil(minutes / 60);
  return `${hours} hour${hours > 1 ? "s" : ""}`;
}
