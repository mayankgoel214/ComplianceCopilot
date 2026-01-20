import { Tool } from "@langchain/core/tools";
import { z } from "zod";

export interface ToolPerformanceMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecution?: Date;
  errorRate: number;
}

export interface ToolFallbackConfig {
  enabled: boolean;
  fallbackTool?: string;
  maxRetries: number;
  retryDelayMs: number;
  circuitBreakerThreshold: number;
}

export abstract class BaseTool extends Tool {
  public readonly category: string;
  public readonly version: string;
  public readonly dependencies: string[];
  public readonly fallbackConfig: ToolFallbackConfig;

  private performanceMetrics: ToolPerformanceMetrics = {
    totalExecutions: 0,
    successfulExecutions: 0,
    failedExecutions: 0,
    averageExecutionTime: 0,
    errorRate: 0,
  };

  private circuitBreakerState: "closed" | "open" | "half-open" = "closed";
  private circuitBreakerFailures = 0;
  private lastFailureTime?: Date;

  constructor({
    name,
    description,
    schema,
    category,
    version = "1.0.0",
    dependencies = [],
    fallbackConfig = {
      enabled: false,
      maxRetries: 3,
      retryDelayMs: 1000,
      circuitBreakerThreshold: 5,
    },
  }: {
    name: string;
    description: string;
    schema: z.ZodSchema;
    category: string;
    version?: string;
    dependencies?: string[];
    fallbackConfig?: ToolFallbackConfig;
  }) {
    super();
    this.name = name;
    this.description = description;
    this.schema = schema;
    this.category = category;
    this.version = version;
    this.dependencies = dependencies;
    this.fallbackConfig = fallbackConfig;
  }

  protected abstract _call(arg: any): Promise<string>;

  async call(arg: any): Promise<string> {
    const startTime = Date.now();

    // Check circuit breaker
    if (this.circuitBreakerState === "open") {
      if (this.shouldAttemptReset()) {
        this.circuitBreakerState = "half-open";
      } else {
        throw new Error(`Tool ${this.name} is in circuit breaker open state`);
      }
    }

    let lastError: Error | null = null;

    for (
      let attempt = 1;
      attempt <= this.fallbackConfig.maxRetries;
      attempt++
    ) {
      try {
        const result = await this._call(arg);
        const executionTime = Date.now() - startTime;

        // Update metrics
        this.updateMetrics(executionTime, true);

        // Reset circuit breaker on success
        if (this.circuitBreakerState === "half-open") {
          this.circuitBreakerState = "closed";
          this.circuitBreakerFailures = 0;
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error("Unknown error");

        // Update metrics
        const executionTime = Date.now() - startTime;
        this.updateMetrics(executionTime, false);

        // Update circuit breaker
        this.circuitBreakerFailures++;
        this.lastFailureTime = new Date();

        if (
          this.circuitBreakerFailures >=
          this.fallbackConfig.circuitBreakerThreshold
        ) {
          this.circuitBreakerState = "open";
        }

        // If not the last attempt, wait before retrying
        if (attempt < this.fallbackConfig.maxRetries) {
          await this.sleep(this.fallbackConfig.retryDelayMs * attempt);
        }
      }
    }

    // All retries failed
    throw new Error(
      `Tool ${this.name} failed after ${this.fallbackConfig.maxRetries} attempts: ${lastError?.message}`
    );
  }

  private updateMetrics(executionTime: number, success: boolean): void {
    this.performanceMetrics.totalExecutions++;

    if (success) {
      this.performanceMetrics.successfulExecutions++;
    } else {
      this.performanceMetrics.failedExecutions++;
    }

    // Update average execution time
    const totalTime =
      this.performanceMetrics.averageExecutionTime *
        (this.performanceMetrics.totalExecutions - 1) +
      executionTime;
    this.performanceMetrics.averageExecutionTime =
      totalTime / this.performanceMetrics.totalExecutions;

    // Update error rate
    this.performanceMetrics.errorRate =
      this.performanceMetrics.failedExecutions /
      this.performanceMetrics.totalExecutions;

    this.performanceMetrics.lastExecution = new Date();
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;

    const timeSinceFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceFailure > 60000; // 1 minute
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getPerformanceMetrics(): ToolPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  getCircuitBreakerState(): {
    state: string;
    failures: number;
    lastFailure?: Date;
  } {
    return {
      state: this.circuitBreakerState,
      failures: this.circuitBreakerFailures,
      lastFailure: this.lastFailureTime,
    };
  }

  resetCircuitBreaker(): void {
    this.circuitBreakerState = "closed";
    this.circuitBreakerFailures = 0;
    this.lastFailureTime = undefined;
  }

  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    issues: string[];
    metrics?: ToolPerformanceMetrics;
  }> {
    const issues: string[] = [];

    try {
      // Check circuit breaker state
      if (this.circuitBreakerState === "open") {
        issues.push("Circuit breaker is open");
      }

      // Check error rate
      if (this.performanceMetrics.errorRate > 0.5) {
        issues.push(
          `High error rate: ${(this.performanceMetrics.errorRate * 100).toFixed(
            1
          )}%`
        );
      }

      // Check if tool has been used recently
      if (this.performanceMetrics.lastExecution) {
        const timeSinceLastExecution =
          Date.now() - this.performanceMetrics.lastExecution.getTime();
        if (timeSinceLastExecution > 300000) {
          // 5 minutes
          issues.push("Tool has not been used recently");
        }
      }

      // Basic health check - can be overridden by specific tools
      const status =
        issues.length === 0
          ? "healthy"
          : issues.some((issue) => issue.includes("Circuit breaker"))
          ? "unhealthy"
          : "degraded";

      return {
        status,
        issues,
        metrics: this.performanceMetrics,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        issues: [error instanceof Error ? error.message : "Unknown error"],
        metrics: this.performanceMetrics,
      };
    }
  }
}

export interface ToolRegistry {
  register(tool: BaseTool): void;
  unregister(name: string): void;
  get(name: string): BaseTool | undefined;
  getByCategory(category: string): BaseTool[];
  list(): BaseTool[];
  healthCheck(): Promise<
    Record<
      string,
      { status: string; issues: string[]; metrics?: ToolPerformanceMetrics }
    >
  >;
  getSystemMetrics(): SystemMetrics;
  checkDependencies(): Promise<DependencyCheckResult>;
  getFallbackTool(originalTool: string): BaseTool | undefined;
}

export interface SystemMetrics {
  totalTools: number;
  healthyTools: number;
  degradedTools: number;
  unhealthyTools: number;
  averageExecutionTime: number;
  totalExecutions: number;
  systemErrorRate: number;
  toolsWithCircuitBreakerOpen: number;
}

export interface DependencyCheckResult {
  satisfied: string[];
  missing: string[];
  circular: string[];
  conflicts: string[];
}

export class DefaultToolRegistry implements ToolRegistry {
  private tools = new Map<string, BaseTool>();
  private dependencyGraph = new Map<string, string[]>();
  private fallbackMappings = new Map<string, string>();

  register(tool: BaseTool): void {
    // Check for name conflicts
    if (this.tools.has(tool.name)) {
      console.warn(`Tool ${tool.name} is already registered. Overwriting.`);
    }

    this.tools.set(tool.name, tool);

    // Update dependency graph
    this.dependencyGraph.set(tool.name, tool.dependencies);

    // Setup fallback mappings if configured
    if (tool.fallbackConfig.enabled && tool.fallbackConfig.fallbackTool) {
      this.fallbackMappings.set(tool.name, tool.fallbackConfig.fallbackTool);
    }
  }

  unregister(name: string): void {
    this.tools.delete(name);
    this.dependencyGraph.delete(name);
    this.fallbackMappings.delete(name);
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  getByCategory(category: string): BaseTool[] {
    return Array.from(this.tools.values()).filter(
      (tool) => tool.category === category
    );
  }

  list(): BaseTool[] {
    return Array.from(this.tools.values());
  }

  async healthCheck(): Promise<
    Record<
      string,
      { status: string; issues: string[]; metrics?: ToolPerformanceMetrics }
    >
  > {
    const results: Record<
      string,
      { status: string; issues: string[]; metrics?: ToolPerformanceMetrics }
    > = {};

    // Check all tools in parallel for better performance
    const healthChecks = Array.from(this.tools.entries()).map(
      async ([name, tool]) => {
        try {
          const health = await tool.healthCheck();
          results[name] = health;
        } catch (error) {
          results[name] = {
            status: "unhealthy",
            issues: [
              error instanceof Error ? error.message : "Health check failed",
            ],
            metrics: tool.getPerformanceMetrics(),
          };
        }
      }
    );

    await Promise.all(healthChecks);
    return results;
  }

  getSystemMetrics(): SystemMetrics {
    const tools = Array.from(this.tools.values());
    const healthResults = tools.map((tool) => ({
      metrics: tool.getPerformanceMetrics(),
      circuitBreaker: tool.getCircuitBreakerState(),
    }));

    const totalTools = tools.length;
    const healthyTools = healthResults.filter(
      (r) => r.metrics.errorRate === 0
    ).length;
    const degradedTools = healthResults.filter(
      (r) => r.metrics.errorRate > 0 && r.metrics.errorRate <= 0.5
    ).length;
    const unhealthyTools = healthResults.filter(
      (r) => r.metrics.errorRate > 0.5
    ).length;
    const toolsWithCircuitBreakerOpen = healthResults.filter(
      (r) => r.circuitBreaker.state === "open"
    ).length;

    const totalExecutions = healthResults.reduce(
      (sum, r) => sum + r.metrics.totalExecutions,
      0
    );
    const totalFailedExecutions = healthResults.reduce(
      (sum, r) => sum + r.metrics.failedExecutions,
      0
    );
    const totalExecutionTime = healthResults.reduce(
      (sum, r) =>
        sum + r.metrics.averageExecutionTime * r.metrics.totalExecutions,
      0
    );

    return {
      totalTools,
      healthyTools,
      degradedTools,
      unhealthyTools,
      averageExecutionTime:
        totalExecutions > 0 ? totalExecutionTime / totalExecutions : 0,
      totalExecutions,
      systemErrorRate:
        totalExecutions > 0 ? totalFailedExecutions / totalExecutions : 0,
      toolsWithCircuitBreakerOpen,
    };
  }

  async checkDependencies(): Promise<DependencyCheckResult> {
    const satisfied: string[] = [];
    const missing: string[] = [];
    const circular: string[] = [];
    const conflicts: string[] = [];

    // Check each tool's dependencies
    for (const [toolName, dependencies] of this.dependencyGraph) {
      for (const dependency of dependencies) {
        if (this.tools.has(dependency)) {
          satisfied.push(`${toolName} -> ${dependency}`);
        } else {
          missing.push(`${toolName} -> ${dependency} (missing)`);
        }
      }
    }

    // Check for circular dependencies
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (toolName: string): boolean => {
      if (recursionStack.has(toolName)) {
        return true;
      }
      if (visited.has(toolName)) {
        return false;
      }

      visited.add(toolName);
      recursionStack.add(toolName);

      const dependencies = this.dependencyGraph.get(toolName) || [];
      for (const dependency of dependencies) {
        if (hasCycle(dependency)) {
          circular.push(`${toolName} -> ${dependency} (circular)`);
          return true;
        }
      }

      recursionStack.delete(toolName);
      return false;
    };

    for (const toolName of this.dependencyGraph.keys()) {
      hasCycle(toolName);
    }

    // Check for version conflicts (simplified check)
    const toolVersions = new Map<string, Map<string, string>>();
    for (const [toolName, tool] of this.tools) {
      const category = tool.category;
      if (!toolVersions.has(category)) {
        toolVersions.set(category, new Map());
      }
      const existingVersion = toolVersions.get(category)!.get(toolName);
      if (existingVersion && existingVersion !== tool.version) {
        conflicts.push(`${toolName}: ${existingVersion} vs ${tool.version}`);
      }
      toolVersions.get(category)!.set(toolName, tool.version);
    }

    return { satisfied, missing, circular, conflicts };
  }

  getFallbackTool(originalTool: string): BaseTool | undefined {
    const fallbackName = this.fallbackMappings.get(originalTool);
    if (fallbackName) {
      return this.tools.get(fallbackName);
    }
    return undefined;
  }
}

// Singleton tool registry
let toolRegistryInstance: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!toolRegistryInstance) {
    toolRegistryInstance = new DefaultToolRegistry();
  }
  return toolRegistryInstance;
}
