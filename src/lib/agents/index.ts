// Base agent infrastructure
export * from './base/types';
export { BaseAgent } from './base/base-agent';

// Tools
export * from './tools';

// Registry and factory
export * from './registry';

// Core agents
export * from './classification';
export * from './ideation';
export * from './grader';
export * from './improvement';

// Supporting infrastructure
export * from './orchestrator';
export * from './validation';

// Agent system initialization
import { getAgentFactory } from './registry';
import { initializeToolRegistry } from './tools';

/**
 * Initialize the complete multi-agent system
 */
export async function initializeAgentSystem(): Promise<void> {
  // Initialize tool registry first
  initializeToolRegistry();

  // Initialize agent factory (templates are auto-registered by imports)
  const factory = getAgentFactory();
  await factory.initialize();

  console.log('Multi-agent system initialized successfully');
}

/**
 * Create a complete agent team for a project
 */
export async function createProjectAgentTeam(projectId: string): Promise<string[]> {
  const factory = getAgentFactory();
  return await factory.createProjectAgentTeam(projectId);
}

/**
 * Clean up agent team for a project
 */
export async function destroyProjectAgentTeam(projectId: string): Promise<void> {
  const factory = getAgentFactory();
  await factory.destroyProjectAgentTeam(projectId);
}

// Re-export key types for convenience
export type {
  AgentMetadata,
  AgentContext,
  AgentInput,
  AgentOutput,
  AgentHealth
} from './base/types';

export type {
  ClassificationInput,
  ClassificationOutput
} from './classification';

export type {
  IdeationInput,
  IdeationOutput,
  QuestionOutput,
  ChatOutput
} from './ideation';

export type {
  GraderInput,
  GraderOutput,
  ComplianceGap,
  FrameworkScore
} from './grader';

export type {
  ImprovementInput,
  ImprovementOutput,
  ImprovementRecommendation
} from './improvement';

export type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowResult
} from './orchestrator';

export type {
  ValidationInput,
  ValidationOutput,
  ValidationIssue
} from './validation';