import { z } from "zod";

export interface AgentCapability {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
}

export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  capabilities: AgentCapability[];
  dependencies: string[];
  tags: string[];
}

export interface AgentContext {
  projectId: string;
  userId?: string;
  sessionId: string;
  conversationHistory: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;
  sharedState: Record<string, any>;
  preferences: Record<string, any>;
}

export interface AgentInput<T = any> {
  data: T;
  context: AgentContext;
  toolResults?: ToolResult[];
}

export interface AgentOutput<T = any> {
  data: T;
  metadata: {
    confidence: number;
    executionTime: number;
    toolsUsed: string[];
    reasoning?: string;
  };
  nextActions?: string[];
  errors?: AgentError[];
}

export interface AgentError {
  code: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  recoverable: boolean;
  context?: Record<string, any>;
}

export interface ToolResult {
  toolName: string;
  input: any;
  output: any;
  success: boolean;
  executionTime: number;
  error?: string;
}

export interface AgentHealth {
  status: "healthy" | "degraded" | "unhealthy";
  lastCheck: Date;
  issues: string[];
  uptime: number;
  toolsAvailable: string[];
  toolsUnavailable: string[];
}

export const AgentInputSchema = z.object({
  data: z.any(),
  context: z.object({
    projectId: z.string(),
    userId: z.string().optional(),
    sessionId: z.string(),
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string(),
          timestamp: z
            .union([z.date(), z.string()])
            .transform((val) =>
              typeof val === "string" ? new Date(val) : val
            ),
          metadata: z.record(z.any()).optional(),
        })
      )
      .default([]),
    sharedState: z.record(z.any()).default({}),
    preferences: z.record(z.any()).default({}),
  }),
  toolResults: z
    .array(
      z.object({
        toolName: z.string(),
        input: z.any(),
        output: z.any(),
        success: z.boolean(),
        executionTime: z.number(),
        error: z.string().optional(),
      })
    )
    .optional(),
});

export const AgentOutputSchema = z.object({
  data: z.any(),
  metadata: z.object({
    confidence: z.number().min(0).max(1),
    executionTime: z.number(),
    toolsUsed: z.array(z.string()),
    reasoning: z.string().optional(),
  }),
  nextActions: z.array(z.string()).optional(),
  errors: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        severity: z.enum(["low", "medium", "high", "critical"]),
        recoverable: z.boolean(),
        context: z.record(z.any()).optional(),
      })
    )
    .optional(),
});
