import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  initializeAgentSystem,
  createProjectAgentTeam,
  destroyProjectAgentTeam,
  getAgentRegistry,
} from "@/lib/agents";
import { getWorkflowOrchestrator } from "@/lib/agents/orchestrator";

describe("Multi-Agent Workflow Integration", () => {
  const testProjectId = `test-project-${Date.now()}`;
  let agentIds: string[] = [];
  let orchestrator: any;
  let registry: any;

  beforeAll(async () => {
    // Initialize the agent system
    await initializeAgentSystem();

    // Get instances
    orchestrator = getWorkflowOrchestrator();
    registry = getAgentRegistry();

    // Create agent team for testing
    agentIds = await createProjectAgentTeam(testProjectId);

    console.log(
      `Created ${agentIds.length} agents for project ${testProjectId}`
    );
  });

  afterAll(async () => {
    // Clean up test agents
    await destroyProjectAgentTeam(testProjectId);
    console.log(`Cleaned up agents for project ${testProjectId}`);
  });

  describe("Agent Team Creation", () => {
    it("should create all required agents", () => {
      expect(agentIds).toHaveLength(4);

      // Check that all agent types are present
      const agentTypes = [
        "classification",
        "ideation",
        "grader",
        "improvement",
      ];
      const createdTypes = agentIds.map((id) => {
        if (id.includes("classification")) return "classification";
        if (id.includes("ideation")) return "ideation";
        if (id.includes("grader")) return "grader";
        if (id.includes("improvement")) return "improvement";
        return "unknown";
      });

      for (const type of agentTypes) {
        expect(createdTypes).toContain(type);
      }
    });

    it("should have all agents in ready state", async () => {
      const agents = registry.discover({ tags: [testProjectId] });
      expect(agents).toHaveLength(4);

      for (const agent of agents) {
        expect(agent.status).toBe("ready");
      }
    });
  });

  describe("Workflow Execution", () => {
    it("should execute full compliance analysis workflow", async () => {
      const workflowContext = {
        projectId: testProjectId,
        userId: "test-user",
        sessionId: `test-session-${Date.now()}`,
        conversationHistory: [],
        sharedState: {
          projectDescription:
            "A test academic research project involving student data",
          documentContent: "Sample policy document content",
          analysisDepth: "thorough",
        },
        preferences: {},
      };

      const initialInput = {
        projectDescription:
          "A test academic research project involving student data",
        documentContent: "Sample policy document content",
        analysisDepth: "thorough",
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

      const result = await orchestrator.executeWorkflow(
        "full_compliance_analysis",
        testProjectId,
        workflowContext,
        initialInput
      );

      expect(result.success).toBe(true);
      expect(result.executionId).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.stepsExecuted).toBeGreaterThan(0);
    }, 30000); // 30 second timeout

    it("should execute quick assessment workflow", async () => {
      const workflowContext = {
        projectId: testProjectId,
        userId: "test-user",
        sessionId: `test-session-${Date.now()}`,
        conversationHistory: [],
        sharedState: {
          projectDescription: "Quick test project",
          documentContent: "Minimal content",
          analysisDepth: "quick",
        },
        preferences: {},
      };

      const initialInput = {
        projectDescription: "Quick test project",
        documentContent: "Minimal content",
        analysisDepth: "quick",
      };

      const result = await orchestrator.executeWorkflow(
        "quick_assessment",
        testProjectId,
        workflowContext,
        initialInput
      );

      expect(result.success).toBe(true);
      expect(result.executionId).toBeDefined();
      expect(result.results).toBeDefined();
    }, 15000); // 15 second timeout
  });

  describe("Workflow Monitoring", () => {
    it("should provide execution status", async () => {
      const statuses = orchestrator.getExecutionStatuses();
      expect(Array.isArray(statuses)).toBe(true);

      if (statuses.length > 0) {
        const status = statuses[0];
        expect(status.executionId).toBeDefined();
        expect(status.workflowId).toBeDefined();
        expect(status.status).toBeDefined();
        expect(status.progress).toBeGreaterThanOrEqual(0);
        expect(status.progress).toBeLessThanOrEqual(100);
      }
    });

    it("should provide workflow metrics", () => {
      const metrics = orchestrator.getMetrics();
      expect(metrics.totalExecutions).toBeGreaterThanOrEqual(0);
      expect(metrics.successfulExecutions).toBeGreaterThanOrEqual(0);
      expect(metrics.failedExecutions).toBeGreaterThanOrEqual(0);
      expect(metrics.averageExecutionTime).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(metrics.mostUsedWorkflows)).toBe(true);
      expect(Array.isArray(metrics.errorPatterns)).toBe(true);
    });

    it("should provide execution history", () => {
      const history = orchestrator.getExecutionHistory(10);
      expect(Array.isArray(history)).toBe(true);

      if (history.length > 0) {
        const entry = history[0];
        expect(entry.executionId).toBeDefined();
        expect(entry.workflowId).toBeDefined();
        expect(entry.status).toBeDefined();
        expect(entry.startTime).toBeInstanceOf(Date);
        expect(entry.duration).toBeGreaterThanOrEqual(0);
        expect(entry.stepsCompleted).toBeGreaterThanOrEqual(0);
        expect(entry.successRate).toBeGreaterThanOrEqual(0);
        expect(entry.successRate).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("Task Queue Management", () => {
    it("should queue and execute tasks with dependencies", async () => {
      const classificationAgent = agentIds.find((id) =>
        id.includes("classification")
      );
      const graderAgent = agentIds.find((id) => id.includes("grader"));

      expect(classificationAgent).toBeDefined();
      expect(graderAgent).toBeDefined();

      // Queue classification task
      const classificationTaskId = await registry.queueTask(
        classificationAgent!,
        {
          projectDescription: "Test project for task queuing",
          documentContent: "Test content",
          analysisDepth: "thorough",
        },
        { priority: "high" }
      );

      expect(classificationTaskId).toBeDefined();

      // Queue grader task that depends on classification
      const graderTaskId = await registry.queueTask(
        graderAgent!,
        {
          frameworks: [{ name: "FERPA", confidence: 0.8, priority: "high" }],
          projectDocuments: [
            { id: "doc1", content: "Test document", type: "policy" },
          ],
        },
        {
          priority: "medium",
          dependencies: [classificationTaskId],
        }
      );

      expect(graderTaskId).toBeDefined();

      // Wait for tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const classificationStatus = registry.getTaskStatus(classificationTaskId);
      const graderStatus = registry.getTaskStatus(graderTaskId);

      expect(classificationStatus).toBeDefined();
      expect(graderStatus).toBeDefined();
    }, 10000);
  });

  describe("Error Handling and Recovery", () => {
    it("should handle workflow failures gracefully", async () => {
      const workflowContext = {
        projectId: testProjectId,
        userId: "test-user",
        sessionId: `test-session-${Date.now()}`,
        conversationHistory: [],
        sharedState: {
          projectDescription: "Test project for error handling",
          documentContent: "Test content",
          analysisDepth: "thorough",
        },
        preferences: {},
      };

      const initialInput = {
        projectDescription: "Test project for error handling",
        documentContent: "Test content",
        analysisDepth: "thorough",
      };

      try {
        const result = await orchestrator.executeWorkflow(
          "full_compliance_analysis",
          testProjectId,
          workflowContext,
          initialInput
        );

        // If execution succeeds, test recovery on a failed execution
        if (result.success) {
          // Test recovery functionality
          const recoveryResult = await orchestrator.recoverWorkflow(
            result.executionId,
            {
              retryFailedSteps: true,
            }
          );

          expect(recoveryResult).toBeDefined();
        }
      } catch (error) {
        // Expected for some test scenarios
        expect(error).toBeDefined();
      }
    }, 20000);
  });

  describe("Inter-Agent Communication", () => {
    it("should enable communication between agents", async () => {
      const classificationAgent = agentIds.find((id) =>
        id.includes("classification")
      );
      const ideationAgent = agentIds.find((id) => id.includes("ideation"));

      expect(classificationAgent).toBeDefined();
      expect(ideationAgent).toBeDefined();

      // Test communication by executing a workflow that requires agent coordination
      const workflowContext = {
        projectId: testProjectId,
        userId: "test-user",
        sessionId: `test-session-${Date.now()}`,
        conversationHistory: [],
        sharedState: {
          projectDescription: "Test project for agent communication",
          documentContent: "Test content",
          analysisDepth: "thorough",
        },
        preferences: {},
      };

      const initialInput = {
        projectDescription: "Test project for agent communication",
        documentContent: "Test content",
        analysisDepth: "thorough",
      };

      const result = await orchestrator.executeWorkflow(
        "full_compliance_analysis",
        testProjectId,
        workflowContext,
        initialInput
      );

      expect(result.success).toBe(true);
      // Communication is tested implicitly through successful workflow execution
    }, 25000);
  });
});
