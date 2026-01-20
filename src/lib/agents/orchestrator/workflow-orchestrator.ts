import { getAgentRegistry } from "../registry";
import { AgentContext } from "../base/types";
import { getCommunicationService } from "../tools/communication-tool";
import { z } from "zod";

export interface WorkflowStep {
  id: string;
  name: string;
  agentType: "classification" | "ideation" | "grader" | "improvement";
  input: any;
  dependencies: string[];
  optional: boolean;
  retryCount: number;
  timeout: number; // milliseconds
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  executionMode: "sequential" | "parallel" | "hybrid";
  errorHandling: "fail_fast" | "continue_on_error" | "retry_failed";
  maxRetries: number;
  totalTimeout: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  projectId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  startTime: Date;
  endTime?: Date;
  context: AgentContext;
  stepResults: Map<string, any>;
  stepErrors: Map<string, Error[]>;
  stepStatus: Map<
    string,
    "pending" | "running" | "completed" | "failed" | "skipped"
  >;
  metrics: {
    totalSteps: number;
    completedSteps: number;
    failedSteps: number;
    skippedSteps: number;
    totalExecutionTime: number;
    averageStepTime: number;
  };
}

export interface WorkflowResult {
  executionId: string;
  success: boolean;
  results: Record<string, any>;
  errors: Record<string, Error[]>;
  metrics: WorkflowExecution["metrics"];
  summary: {
    stepsExecuted: number;
    stepsSkipped: number;
    stepsFailed: number;
    totalTime: number;
    successRate: number;
  };
}

export interface WorkflowMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  averageStepsPerExecution: number;
  mostUsedWorkflows: Array<{ workflowId: string; count: number }>;
  stepSuccessRates: Record<string, number>;
  errorPatterns: Array<{ error: string; count: number }>;
}

export class WorkflowOrchestrator {
  private executions = new Map<string, WorkflowExecution>();
  private workflows = new Map<string, WorkflowDefinition>();
  private metrics: WorkflowMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    averageStepsPerExecution: 0,
    mostUsedWorkflows: [],
    stepSuccessRates: {},
    errorPatterns: [],
  };
  private monitoringInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDefaultWorkflows();
    this.startMonitoring();
  }

  /**
   * Register a workflow definition
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow);
    console.log(`Registered workflow: ${workflow.name}`);
  }

  /**
   * Execute a workflow
   */
  async executeWorkflow(
    workflowId: string,
    projectId: string,
    context: AgentContext,
    initialInput: any = {}
  ): Promise<WorkflowResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const executionId = this.generateExecutionId();
    const execution = this.createExecution(
      executionId,
      workflow,
      projectId,
      context
    );

    this.executions.set(executionId, execution);

    try {
      execution.status = "running";
      execution.startTime = new Date();

      // Execute workflow based on execution mode
      switch (workflow.executionMode) {
        case "sequential":
          await this.executeSequential(execution, workflow, initialInput);
          break;
        case "parallel":
          await this.executeParallel(execution, workflow, initialInput);
          break;
        case "hybrid":
          await this.executeHybrid(execution, workflow, initialInput);
          break;
      }

      execution.status = "completed";
      execution.endTime = new Date();

      // Update metrics
      this.updateMetrics(execution, true);

      return this.createWorkflowResult(execution);
    } catch (error) {
      execution.status = "failed";
      execution.endTime = new Date();

      // Update metrics
      this.updateMetrics(execution, false, error as Error);

      console.error(`Workflow ${workflowId} execution failed:`, error);
      throw error;
    }
  }

  /**
   * Get workflow execution status
   */
  getExecutionStatus(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflow(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status === "running") {
      execution.status = "cancelled";
      execution.endTime = new Date();
      console.log(`Workflow execution ${executionId} cancelled`);
    }
  }

  /**
   * List all workflow definitions
   */
  listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get workflow metrics and monitoring data
   */
  getMetrics(): WorkflowMetrics {
    return { ...this.metrics };
  }

  /**
   * Get real-time execution status for all workflows
   */
  getExecutionStatuses(): Array<{
    executionId: string;
    workflowId: string;
    projectId: string;
    status: string;
    progress: number;
    startTime: Date;
    estimatedCompletion?: Date;
  }> {
    return Array.from(this.executions.values()).map((execution) => {
      const workflow = this.workflows.get(execution.workflowId);
      const totalSteps = workflow?.steps.length || 0;
      const completedSteps = execution.metrics.completedSteps;
      const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;

      let estimatedCompletion: Date | undefined;
      if (
        execution.status === "running" &&
        execution.metrics.averageStepTime > 0
      ) {
        const remainingSteps = totalSteps - completedSteps;
        const estimatedTime =
          remainingSteps * execution.metrics.averageStepTime;
        estimatedCompletion = new Date(Date.now() + estimatedTime);
      }

      return {
        executionId: execution.id,
        workflowId: execution.workflowId,
        projectId: execution.projectId,
        status: execution.status,
        progress,
        startTime: execution.startTime,
        estimatedCompletion,
      };
    });
  }

  /**
   * Get detailed execution history
   */
  getExecutionHistory(limit: number = 50): Array<{
    executionId: string;
    workflowId: string;
    projectId: string;
    status: string;
    startTime: Date;
    endTime?: Date;
    duration: number;
    stepsCompleted: number;
    stepsFailed: number;
    successRate: number;
  }> {
    return Array.from(this.executions.values())
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
      .slice(0, limit)
      .map((execution) => ({
        executionId: execution.id,
        workflowId: execution.workflowId,
        projectId: execution.projectId,
        status: execution.status,
        startTime: execution.startTime,
        endTime: execution.endTime,
        duration: execution.endTime
          ? execution.endTime.getTime() - execution.startTime.getTime()
          : Date.now() - execution.startTime.getTime(),
        stepsCompleted: execution.metrics.completedSteps,
        stepsFailed: execution.metrics.failedSteps,
        successRate:
          execution.metrics.totalSteps > 0
            ? execution.metrics.completedSteps / execution.metrics.totalSteps
            : 0,
      }));
  }

  /**
   * Execute steps sequentially
   */
  private async executeSequential(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    initialInput: any
  ): Promise<void> {
    const registry = getAgentRegistry();
    let currentInput = initialInput;

    for (const step of workflow.steps) {
      if (execution.status === "cancelled") break;

      try {
        // Check dependencies
        if (!this.areDependenciesMet(step, execution)) {
          if (step.optional) {
            this.markStepSkipped(execution, step);
            continue;
          } else {
            throw new Error(`Dependencies not met for step ${step.id}`);
          }
        }

        // Execute step
        await this.executeStep(execution, step, currentInput, registry);

        // Use step result as input for next step
        const stepResult = execution.stepResults.get(step.id);
        if (stepResult) {
          currentInput = { ...currentInput, [step.agentType]: stepResult };
        }
      } catch (error) {
        await this.handleStepError(execution, step, error as Error, workflow);
      }
    }
  }

  /**
   * Execute steps in parallel
   */
  private async executeParallel(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    initialInput: any
  ): Promise<void> {
    const registry = getAgentRegistry();

    // Execute all independent steps in parallel
    const stepPromises = workflow.steps
      .filter((step) => step.dependencies.length === 0)
      .map((step) => this.executeStep(execution, step, initialInput, registry));

    await Promise.allSettled(stepPromises);

    // Execute dependent steps after their dependencies complete
    const remainingSteps = workflow.steps.filter(
      (step) => step.dependencies.length > 0
    );

    while (remainingSteps.length > 0 && execution.status !== "cancelled") {
      const readySteps = remainingSteps.filter((step) =>
        this.areDependenciesMet(step, execution)
      );

      if (readySteps.length === 0) {
        // No more steps can be executed
        break;
      }

      const readyPromises = readySteps.map((step) =>
        this.executeStep(execution, step, initialInput, registry)
      );

      await Promise.allSettled(readyPromises);

      // Remove executed steps
      readySteps.forEach((step) => {
        const index = remainingSteps.indexOf(step);
        if (index > -1) remainingSteps.splice(index, 1);
      });
    }
  }

  /**
   * Execute steps in hybrid mode (combination of sequential and parallel)
   */
  private async executeHybrid(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    initialInput: any
  ): Promise<void> {
    // Group steps by dependency level
    const stepLevels = this.groupStepsByDependencyLevel(workflow.steps);
    let currentInput = initialInput;

    for (const level of stepLevels) {
      if (execution.status === "cancelled") break;

      // Execute steps in this level in parallel
      const registry = getAgentRegistry();
      const levelPromises = level.map((step) =>
        this.executeStep(execution, step, currentInput, registry)
      );

      await Promise.allSettled(levelPromises);

      // Merge results for next level
      for (const step of level) {
        const stepResult = execution.stepResults.get(step.id);
        if (stepResult) {
          currentInput = { ...currentInput, [step.agentType]: stepResult };
        }
      }
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    execution: WorkflowExecution,
    step: WorkflowStep,
    input: any,
    registry: any
  ): Promise<void> {
    const stepStartTime = Date.now();
    execution.stepStatus.set(step.id, "running");

    try {
      // Find agent for this step
      const projectAgents = registry.discover({
        tags: [execution.projectId],
        capabilities: [this.getRequiredCapability(step.agentType)],
      });

      const agent = projectAgents.find((a: any) =>
        a.metadata.id.includes(step.agentType)
      );

      if (!agent) {
        throw new Error(
          `No ${step.agentType} agent found for project ${execution.projectId}`
        );
      }

      // Prepare step input
      const stepInput = this.prepareStepInput(step, input, execution);

      // Notify other agents about step start
      await this.notifyStepStart(execution, step, agent.metadata.id);

      // Execute agent with timeout and coordination
      const result = await Promise.race([
        registry.executeAgentWithCoordination(
          agent.metadata.id,
          stepInput,
          execution.context,
          {
            priority: step.optional ? "medium" : "high",
            maxRetries: step.retryCount,
            dependencies: step.dependencies,
          }
        ),
        this.createTimeoutPromise(step.timeout),
      ]);

      // Store result
      execution.stepResults.set(step.id, result);
      execution.stepStatus.set(step.id, "completed");

      // Notify other agents about step completion
      await this.notifyStepCompletion(
        execution,
        step,
        agent.metadata.id,
        result
      );

      // Update metrics
      const stepTime = Date.now() - stepStartTime;
      execution.metrics.completedSteps++;
      execution.metrics.totalExecutionTime += stepTime;
      execution.metrics.averageStepTime =
        execution.metrics.totalExecutionTime / execution.metrics.completedSteps;

      console.log(`Step ${step.id} completed in ${stepTime}ms`);
    } catch (error) {
      execution.stepStatus.set(step.id, "failed");
      execution.metrics.failedSteps++;

      const stepErrors = execution.stepErrors.get(step.id) || [];
      stepErrors.push(error as Error);
      execution.stepErrors.set(step.id, stepErrors);

      // Notify other agents about step failure
      await this.notifyStepFailure(execution, step, error as Error);

      throw error;
    }
  }

  /**
   * Handle step execution errors
   */
  private async handleStepError(
    execution: WorkflowExecution,
    step: WorkflowStep,
    error: Error,
    workflow: WorkflowDefinition
  ): Promise<void> {
    console.error(`Step ${step.id} failed:`, error);

    const stepErrors = execution.stepErrors.get(step.id) || [];
    stepErrors.push(error);
    execution.stepErrors.set(step.id, stepErrors);

    switch (workflow.errorHandling) {
      case "fail_fast":
        throw error;

      case "continue_on_error":
        if (!step.optional) {
          console.warn(`Non-optional step ${step.id} failed but continuing`);
        }
        this.markStepSkipped(execution, step);
        break;

      case "retry_failed":
        if (stepErrors.length < step.retryCount) {
          console.log(
            `Retrying step ${step.id}, attempt ${stepErrors.length + 1}`
          );
          // Reset step status for retry
          execution.stepStatus.set(step.id, "pending");
          // The retry will be handled by the main execution loop
          return;
        } else {
          console.error(
            `Step ${step.id} failed after ${step.retryCount} retries`
          );
          this.markStepSkipped(execution, step);
        }
        break;
    }
  }

  /**
   * Recover from workflow execution failures
   */
  async recoverWorkflow(
    executionId: string,
    options: {
      retryFailedSteps?: boolean;
      skipFailedSteps?: boolean;
      restartFromStep?: string;
    } = {}
  ): Promise<WorkflowResult> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const workflow = this.workflows.get(execution.workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${execution.workflowId} not found`);
    }

    console.log(`Recovering workflow execution ${executionId}`);

    // Reset execution status
    execution.status = "running";
    execution.endTime = undefined;

    try {
      if (options.restartFromStep) {
        // Restart from a specific step
        await this.restartFromStep(
          execution,
          workflow,
          options.restartFromStep
        );
      } else if (options.retryFailedSteps) {
        // Retry all failed steps
        await this.retryFailedSteps(execution, workflow);
      } else if (options.skipFailedSteps) {
        // Continue with remaining steps, skipping failed ones
        await this.continueWithRemainingSteps(execution, workflow);
      } else {
        // Default: retry failed steps
        await this.retryFailedSteps(execution, workflow);
      }

      execution.status = "completed";
      execution.endTime = new Date();
      this.updateMetrics(execution, true);

      return this.createWorkflowResult(execution);
    } catch (error) {
      execution.status = "failed";
      execution.endTime = new Date();
      this.updateMetrics(execution, false, error as Error);
      throw error;
    }
  }

  private async restartFromStep(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    stepId: string
  ): Promise<void> {
    const stepIndex = workflow.steps.findIndex((step) => step.id === stepId);
    if (stepIndex === -1) {
      throw new Error(`Step ${stepId} not found in workflow`);
    }

    // Reset all steps from the restart point
    for (let i = stepIndex; i < workflow.steps.length; i++) {
      const step = workflow.steps[i];
      execution.stepStatus.set(step.id, "pending");
      execution.stepResults.delete(step.id);
      execution.stepErrors.delete(step.id);
    }

    // Re-execute from the restart point
    const remainingSteps = workflow.steps.slice(stepIndex);
    const registry = getAgentRegistry();

    for (const step of remainingSteps) {
      if (execution.status === "cancelled") break;

      try {
        if (!this.areDependenciesMet(step, execution)) {
          if (step.optional) {
            this.markStepSkipped(execution, step);
            continue;
          } else {
            throw new Error(`Dependencies not met for step ${step.id}`);
          }
        }

        await this.executeStep(execution, step, {}, registry);
      } catch (error) {
        await this.handleStepError(execution, step, error as Error, workflow);
      }
    }
  }

  private async retryFailedSteps(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition
  ): Promise<void> {
    const failedSteps = Array.from(execution.stepStatus.entries())
      .filter(([_, status]) => status === "failed")
      .map(([stepId, _]) => workflow.steps.find((step) => step.id === stepId))
      .filter(Boolean);

    const registry = getAgentRegistry();

    for (const step of failedSteps) {
      if (!step) continue;

      try {
        // Reset step status
        execution.stepStatus.set(step.id, "pending");
        execution.stepErrors.delete(step.id);

        // Re-execute step
        await this.executeStep(execution, step, {}, registry);
      } catch (error) {
        await this.handleStepError(execution, step, error as Error, workflow);
      }
    }
  }

  private async continueWithRemainingSteps(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition
  ): Promise<void> {
    const remainingSteps = workflow.steps.filter(
      (step) => execution.stepStatus.get(step.id) === "pending"
    );

    const registry = getAgentRegistry();

    for (const step of remainingSteps) {
      if (execution.status === "cancelled") break;

      try {
        if (!this.areDependenciesMet(step, execution)) {
          if (step.optional) {
            this.markStepSkipped(execution, step);
            continue;
          } else {
            throw new Error(`Dependencies not met for step ${step.id}`);
          }
        }

        await this.executeStep(execution, step, {}, registry);
      } catch (error) {
        await this.handleStepError(execution, step, error as Error, workflow);
      }
    }
  }

  private createExecution(
    executionId: string,
    workflow: WorkflowDefinition,
    projectId: string,
    context: AgentContext
  ): WorkflowExecution {
    return {
      id: executionId,
      workflowId: workflow.id,
      projectId,
      status: "pending",
      startTime: new Date(),
      context,
      stepResults: new Map(),
      stepErrors: new Map(),
      stepStatus: new Map(),
      metrics: {
        totalSteps: workflow.steps.length,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        totalExecutionTime: 0,
        averageStepTime: 0,
      },
    };
  }

  private createWorkflowResult(execution: WorkflowExecution): WorkflowResult {
    const results: Record<string, any> = {};
    const errors: Record<string, Error[]> = {};

    execution.stepResults.forEach((result, stepId) => {
      results[stepId] = result;
    });

    execution.stepErrors.forEach((stepErrors, stepId) => {
      errors[stepId] = stepErrors;
    });

    const stepsExecuted = execution.metrics.completedSteps;
    const stepsSkipped = execution.metrics.skippedSteps;
    const stepsFailed = execution.metrics.failedSteps;
    const totalSteps = execution.metrics.totalSteps;

    return {
      executionId: execution.id,
      success: execution.status === "completed",
      results,
      errors,
      metrics: execution.metrics,
      summary: {
        stepsExecuted,
        stepsSkipped,
        stepsFailed,
        totalTime: execution.endTime
          ? execution.endTime.getTime() - execution.startTime.getTime()
          : 0,
        successRate: totalSteps > 0 ? stepsExecuted / totalSteps : 0,
      },
    };
  }

  private areDependenciesMet(
    step: WorkflowStep,
    execution: WorkflowExecution
  ): boolean {
    return step.dependencies.every(
      (depId) => execution.stepStatus.get(depId) === "completed"
    );
  }

  private markStepSkipped(
    execution: WorkflowExecution,
    step: WorkflowStep
  ): void {
    execution.stepStatus.set(step.id, "skipped");
    execution.metrics.skippedSteps++;
  }

  private prepareStepInput(
    step: WorkflowStep,
    input: any,
    execution: WorkflowExecution
  ): any {
    // Merge step input with previous results based on dependencies
    let stepInput = { ...step.input };

    for (const depId of step.dependencies) {
      const depResult = execution.stepResults.get(depId);
      if (depResult) {
        stepInput = { ...stepInput, ...depResult };
      }
    }

    return { ...stepInput, ...input };
  }

  private getRequiredCapability(agentType: string): string {
    const capabilityMap: Record<string, string> = {
      classification: "framework_detection",
      ideation: "question_generation",
      grader: "compliance_analysis",
      improvement: "remediation_planning",
    };
    return capabilityMap[agentType] || agentType;
  }

  private groupStepsByDependencyLevel(steps: WorkflowStep[]): WorkflowStep[][] {
    const levels: WorkflowStep[][] = [];
    const processed = new Set<string>();
    const stepMap = new Map(steps.map((step) => [step.id, step]));

    while (processed.size < steps.length) {
      const currentLevel: WorkflowStep[] = [];

      for (const step of steps) {
        if (processed.has(step.id)) continue;

        // Check if all dependencies are processed
        const canProcess = step.dependencies.every((depId) =>
          processed.has(depId)
        );

        if (canProcess) {
          currentLevel.push(step);
          processed.add(step.id);
        }
      }

      if (currentLevel.length === 0) {
        // Circular dependency or other issue
        console.warn("Unable to resolve all step dependencies");
        break;
      }

      levels.push(currentLevel);
    }

    return levels;
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Step timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Inter-agent communication methods
  private async notifyStepStart(
    execution: WorkflowExecution,
    step: WorkflowStep,
    agentId: string
  ): Promise<void> {
    try {
      const commService = getCommunicationService();
      const channel = `workflow-${execution.id}`;

      commService.broadcast(
        "workflow-orchestrator",
        channel,
        {
          type: "step_started",
          executionId: execution.id,
          stepId: step.id,
          agentId,
          timestamp: new Date().toISOString(),
        },
        "status"
      );
    } catch (error) {
      console.warn(`Failed to notify step start for ${step.id}:`, error);
    }
  }

  private async notifyStepCompletion(
    execution: WorkflowExecution,
    step: WorkflowStep,
    agentId: string,
    result: any
  ): Promise<void> {
    try {
      const commService = getCommunicationService();
      const channel = `workflow-${execution.id}`;

      commService.broadcast(
        "workflow-orchestrator",
        channel,
        {
          type: "step_completed",
          executionId: execution.id,
          stepId: step.id,
          agentId,
          result: this.sanitizeResult(result),
          timestamp: new Date().toISOString(),
        },
        "data"
      );
    } catch (error) {
      console.warn(`Failed to notify step completion for ${step.id}:`, error);
    }
  }

  private async notifyStepFailure(
    execution: WorkflowExecution,
    step: WorkflowStep,
    error: Error
  ): Promise<void> {
    try {
      const commService = getCommunicationService();
      const channel = `workflow-${execution.id}`;

      commService.broadcast(
        "workflow-orchestrator",
        channel,
        {
          type: "step_failed",
          executionId: execution.id,
          stepId: step.id,
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        "status"
      );
    } catch (commError) {
      console.warn(`Failed to notify step failure for ${step.id}:`, commError);
    }
  }

  private sanitizeResult(result: any): any {
    // Remove sensitive data and limit size
    if (typeof result === "object" && result !== null) {
      const sanitized = { ...result };
      // Remove large fields that might not be needed for communication
      if (sanitized.documentContent) {
        sanitized.documentContent = "[REDACTED - Large content]";
      }
      if (sanitized.content) {
        sanitized.content = sanitized.content.substring(0, 500) + "...";
      }
      return sanitized;
    }
    return result;
  }

  // Monitoring and metrics methods
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.cleanupOldExecutions();
      this.updateStepSuccessRates();
    }, 300000); // Every 5 minutes
  }

  private updateMetrics(
    execution: WorkflowExecution,
    success: boolean,
    error?: Error
  ): void {
    this.metrics.totalExecutions++;

    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;

      // Track error patterns
      if (error) {
        const errorMessage = error.message;
        const existingError = this.metrics.errorPatterns.find(
          (e) => e.error === errorMessage
        );
        if (existingError) {
          existingError.count++;
        } else {
          this.metrics.errorPatterns.push({ error: errorMessage, count: 1 });
        }
      }
    }

    // Update average execution time
    const executionTime = execution.endTime
      ? execution.endTime.getTime() - execution.startTime.getTime()
      : 0;

    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) +
        executionTime) /
      this.metrics.totalExecutions;

    // Update average steps per execution
    this.metrics.averageStepsPerExecution =
      (this.metrics.averageStepsPerExecution *
        (this.metrics.totalExecutions - 1) +
        execution.metrics.totalSteps) /
      this.metrics.totalExecutions;

    // Update most used workflows
    const existingWorkflow = this.metrics.mostUsedWorkflows.find(
      (w) => w.workflowId === execution.workflowId
    );
    if (existingWorkflow) {
      existingWorkflow.count++;
    } else {
      this.metrics.mostUsedWorkflows.push({
        workflowId: execution.workflowId,
        count: 1,
      });
    }

    // Sort and limit most used workflows
    this.metrics.mostUsedWorkflows.sort((a, b) => b.count - a.count);
    this.metrics.mostUsedWorkflows = this.metrics.mostUsedWorkflows.slice(
      0,
      10
    );
  }

  private updateStepSuccessRates(): void {
    const stepStats = new Map<string, { total: number; successful: number }>();

    // Count step executions across all workflows
    for (const execution of this.executions.values()) {
      const workflow = this.workflows.get(execution.workflowId);
      if (!workflow) continue;

      for (const step of workflow.steps) {
        const stats = stepStats.get(step.id) || { total: 0, successful: 0 };
        stats.total++;

        const stepStatus = execution.stepStatus.get(step.id);
        if (stepStatus === "completed") {
          stats.successful++;
        }

        stepStats.set(step.id, stats);
      }
    }

    // Calculate success rates
    this.metrics.stepSuccessRates = {};
    for (const [stepId, stats] of stepStats) {
      this.metrics.stepSuccessRates[stepId] =
        stats.total > 0 ? stats.successful / stats.total : 0;
    }
  }

  private cleanupOldExecutions(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const executionsToRemove: string[] = [];

    for (const [executionId, execution] of this.executions) {
      if (
        execution.startTime.getTime() < oneDayAgo &&
        (execution.status === "completed" ||
          execution.status === "failed" ||
          execution.status === "cancelled")
      ) {
        executionsToRemove.push(executionId);
      }
    }

    for (const executionId of executionsToRemove) {
      this.executions.delete(executionId);
    }

    if (executionsToRemove.length > 0) {
      console.log(
        `Cleaned up ${executionsToRemove.length} old workflow executions`
      );
    }
  }

  private initializeDefaultWorkflows(): void {
    // Full compliance analysis workflow
    this.registerWorkflow({
      id: "full_compliance_analysis",
      name: "Full Compliance Analysis",
      description: "Complete compliance analysis workflow with all agents",
      executionMode: "sequential",
      errorHandling: "continue_on_error",
      maxRetries: 2,
      totalTimeout: 300000, // 5 minutes
      steps: [
        {
          id: "classification",
          name: "Framework Classification",
          agentType: "classification",
          input: {},
          dependencies: [],
          optional: false,
          retryCount: 2,
          timeout: 60000,
        },
        {
          id: "ideation",
          name: "Generate Questions",
          agentType: "ideation",
          input: { mode: "questions" },
          dependencies: ["classification"],
          optional: true,
          retryCount: 1,
          timeout: 45000,
        },
        {
          id: "grading",
          name: "Compliance Grading",
          agentType: "grader",
          input: {},
          dependencies: ["classification"],
          optional: false,
          retryCount: 2,
          timeout: 90000,
        },
        {
          id: "improvement",
          name: "Improvement Recommendations",
          agentType: "improvement",
          input: {},
          dependencies: ["grading"],
          optional: false,
          retryCount: 1,
          timeout: 60000,
        },
      ],
    });

    // Quick assessment workflow
    this.registerWorkflow({
      id: "quick_assessment",
      name: "Quick Compliance Assessment",
      description:
        "Fast compliance assessment focusing on classification and basic scoring",
      executionMode: "parallel",
      errorHandling: "fail_fast",
      maxRetries: 1,
      totalTimeout: 120000, // 2 minutes
      steps: [
        {
          id: "classification",
          name: "Framework Classification",
          agentType: "classification",
          input: { analysisDepth: "quick" },
          dependencies: [],
          optional: false,
          retryCount: 1,
          timeout: 30000,
        },
        {
          id: "grading",
          name: "Compliance Grading",
          agentType: "grader",
          input: {},
          dependencies: ["classification"],
          optional: false,
          retryCount: 1,
          timeout: 60000,
        },
      ],
    });
  }
}

// Singleton instance
let orchestratorInstance: WorkflowOrchestrator | null = null;

export function getWorkflowOrchestrator(): WorkflowOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new WorkflowOrchestrator();
  }
  return orchestratorInstance;
}
