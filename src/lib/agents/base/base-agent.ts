import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import {
  BaseMessage,
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";
import { Tool } from "@langchain/core/tools";
import { createAgent } from "langchain";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";
import { getGeminiApiKey, AI_CONFIG } from "../../ai/config";
import { errorLogger } from "../../utils/error-logger";
import {
  AgentMetadata,
  AgentContext,
  AgentInput,
  AgentOutput,
  AgentHealth,
  AgentError,
  ToolResult,
  AgentInputSchema,
  AgentOutputSchema,
} from "./types";

export abstract class BaseAgent<TInput = any, TOutput = any> {
  protected model: ChatGoogleGenerativeAI;
  protected tools: Tool[] = [];
  protected executor?: ReturnType<typeof createAgent>;
  protected initialized = false;

  public readonly metadata: AgentMetadata;

  constructor(metadata: AgentMetadata) {
    this.metadata = metadata;
    this.model = new ChatGoogleGenerativeAI({
      apiKey: getGeminiApiKey(),
      model: AI_CONFIG.gemini.model,
      temperature: AI_CONFIG.gemini.temperature,
      maxOutputTokens: AI_CONFIG.gemini.maxTokens,
      maxRetries: AI_CONFIG.gemini.maxRetries,
    });
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize tools
      this.tools = await this.initializeTools();

      // LangChain 1.x replaced createToolCallingAgent + AgentExecutor with a
      // single createAgent. Subclasses still describe themselves with a
      // ChatPromptTemplate, so the system text is lifted out of it here rather
      // than rewriting all five agents.
      // An agent that declares an output schema gets structured output from
      // the model instead of prose. That matters here because the original
      // implementation recovered its numbers by running regexes over the
      // model's sentences, which is how confidence scores ended up wrong.
      const responseFormat = this.outputSchema?.();

      this.executor = createAgent({
        model: this.model,
        tools: this.tools,
        systemPrompt: await this.extractSystemPrompt(),
        ...(responseFormat ? { responseFormat } : {}),
      });

      this.initialized = true;
      console.log(`Agent ${this.metadata.name} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize agent ${this.metadata.name}:`, error);
      throw error;
    }
  }

  async execute(input: AgentInput<TInput>): Promise<AgentOutput<TOutput>> {
    const startTime = Date.now();

    try {
      // Validate and sanitize input with better error handling
      let validatedInput: AgentInput<TInput>;
      try {
        // The zod schema declares `data` optional while AgentInput requires
        // it; parse returns the widened shape, so assert back to the contract
        // the caller already satisfied.
        validatedInput = AgentInputSchema.parse(input) as AgentInput<TInput>;
      } catch (validationError) {
        errorLogger.logError(validationError, {
          agentId: this.metadata.id,
          agentName: this.metadata.name,
          operation: "input_validation",
          input: input,
        });
        throw new Error(
          `Invalid input format: ${
            validationError instanceof Error
              ? validationError.message
              : "Unknown validation error"
          }`
        );
      }

      await this.ensureInitialized();

      if (!this.executor) {
        throw new Error("Agent executor not initialized");
      }

      // Pre-process input
      const processedInput = await this.preprocessInput(validatedInput);

      // 1.x takes a message list rather than { input, chat_history }, and
      // returns the full conversation rather than { output, intermediateSteps }.
      // Both are adapted here so the subclasses' postprocessOutput keeps the
      // shape it was written against.
      const raw = await this.executor.invoke({
        messages: [
          ...this.formatChatHistory(processedInput.context.conversationHistory),
          new HumanMessage(this.formatInputForAgent(processedInput)),
        ],
      });

      const result = this.adaptAgentResult(raw);

      // Post-process output
      const output = await this.postprocessOutput(result, processedInput);

      // Calculate execution time
      const executionTime = Date.now() - startTime;

      // Format final output
      const agentOutput: AgentOutput<TOutput> = {
        data: output,
        metadata: {
          confidence: this.calculateConfidence(result),
          executionTime,
          toolsUsed: this.extractToolsUsed(result.intermediateSteps || []),
          reasoning: this.extractReasoning(result),
        },
        nextActions: this.suggestNextActions(output, processedInput),
      };

      // Validate output with error handling
      try {
        AgentOutputSchema.parse(agentOutput);
      } catch (outputValidationError) {
        console.warn(
          `Output validation failed for agent ${this.metadata.name}:`,
          outputValidationError
        );
        // Continue with the output even if validation fails
      }

      return agentOutput;
    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Enhanced error logging using centralized logger
      errorLogger.logAgentExecutionError(
        error,
        this.metadata.id,
        input,
        input.context
      );

      // Check if it's an API quota/rate limit error
      const isQuotaError =
        error instanceof Error &&
        (error.message.includes("quota") ||
          error.message.includes("Too Many Requests") ||
          error.message.includes("429"));

      const isAPIError =
        error instanceof Error &&
        (error.message.includes("GoogleGenerativeAI Error") ||
          error.message.includes("API"));

      const isValidationError =
        error instanceof Error &&
        error.message.includes("Invalid input format");

      return {
        data: {} as TOutput,
        metadata: {
          confidence: 0,
          executionTime,
          toolsUsed: [],
          reasoning: isQuotaError
            ? "API quota exceeded - please wait before retrying"
            : isAPIError
            ? "AI API temporarily unavailable"
            : isValidationError
            ? "Input validation failed - check request format"
            : `Agent execution failed: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
        },
        errors: [
          {
            code: isQuotaError
              ? "QUOTA_EXCEEDED"
              : isAPIError
              ? "API_ERROR"
              : isValidationError
              ? "VALIDATION_ERROR"
              : "EXECUTION_ERROR",
            message:
              error instanceof Error ? error.message : "Unknown error occurred",
            severity: isQuotaError
              ? "medium"
              : isValidationError
              ? "high"
              : "high",
            recoverable: true,
            context: {
              input,
              agentName: this.metadata.name,
              agentId: this.metadata.id,
            },
          },
        ],
      };
    }
  }

  async healthCheck(): Promise<AgentHealth> {
    const startTime = Date.now();
    const issues: string[] = [];
    const toolsAvailable: string[] = [];
    const toolsUnavailable: string[] = [];

    // Check if model configuration is valid without making API call
    try {
      if (!this.model || !getGeminiApiKey()) {
        issues.push("Model not configured properly");
      }
    } catch (error) {
      issues.push("Model configuration error");
    }

    // Check tool availability
    for (const tool of this.tools) {
      try {
        // Simple tool validation - check if tool can be called
        if (tool.name && tool.description) {
          toolsAvailable.push(tool.name);
        } else {
          toolsUnavailable.push(tool.name || "unknown");
          issues.push(
            `Tool ${tool.name || "unknown"} has invalid configuration`
          );
        }
      } catch (error) {
        toolsUnavailable.push(tool.name || "unknown");
        issues.push(`Tool ${tool.name || "unknown"} failed health check`);
      }
    }

    const status =
      issues.length === 0
        ? "healthy"
        : issues.length <= 2
        ? "degraded"
        : "unhealthy";

    return {
      status,
      lastCheck: new Date(),
      issues,
      uptime: Date.now() - startTime,
      toolsAvailable,
      toolsUnavailable,
    };
  }

  // Abstract methods to be implemented by concrete agents
  protected abstract initializeTools(): Promise<Tool[]>;
  protected abstract preprocessInput(
    input: AgentInput<TInput>
  ): Promise<AgentInput<TInput>>;
  protected abstract postprocessOutput(
    result: any,
    input: AgentInput<TInput>
  ): Promise<TOutput>;
  /**
   * The system instructions, taken from the subclass's ChatPromptTemplate.
   *
   * 1.x wants a plain system prompt where the old API took the whole template.
   * Formatting with every declared variable blank yields the static system text
   * without requiring each agent to be rewritten.
   */
  protected async extractSystemPrompt(): Promise<string> {
    const template = this.createPrompt();
    const blanks = Object.fromEntries(
      template.inputVariables.map((name) => [name, ""])
    );

    try {
      const messages = await template.formatMessages(blanks);
      const system = messages
        .filter((m) => m.getType() === "system")
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join("\n\n")
        .trim();
      if (system) return system;
    } catch {
      // A template with a placeholder that will not accept a blank falls
      // through to the metadata description, which is never empty.
    }

    return this.metadata.description;
  }

  /**
   * Reshape a 1.x agent result into what the subclasses expect.
   *
   * `output` is the final assistant message. `intermediateSteps` is rebuilt
   * from the tool calls in the transcript, since the agents use it to report
   * which tools ran.
   */
  /**
   * Optional. An agent that implements this receives the model's answer already
   * parsed into this shape, rather than having to recover it from prose.
   */
  protected outputSchema?(): z.ZodTypeAny;

  protected adaptAgentResult(raw: unknown): {
    output: string;
    structured?: unknown;
    intermediateSteps: Array<{ action: { tool: string }; observation: unknown }>;
  } {
    const messages =
      (raw as { messages?: BaseMessage[] } | undefined)?.messages ?? [];

    const last = messages[messages.length - 1];
    const output =
      last && typeof last.content === "string"
        ? last.content
        : JSON.stringify(last?.content ?? "");

    const intermediateSteps: Array<{
      action: { tool: string };
      observation: unknown;
    }> = [];

    for (const message of messages) {
      const calls = (message as AIMessage).tool_calls;
      if (!calls?.length) continue;
      for (const call of calls) {
        const response = messages.find(
          (m) => m.getType() === "tool" &&
            (m as ToolMessage).tool_call_id === call.id
        );
        intermediateSteps.push({
          action: { tool: call.name },
          observation: response?.content ?? null,
        });
      }
    }

    return {
      output,
      structured: (raw as { structuredResponse?: unknown } | undefined)
        ?.structuredResponse,
      intermediateSteps,
    };
  }

  protected abstract createPrompt(): ChatPromptTemplate;

  // Default implementations that can be overridden
  protected formatInputForAgent(input: AgentInput<TInput>): string {
    return JSON.stringify(input.data);
  }

  protected formatChatHistory(
    history: AgentContext["conversationHistory"]
  ): BaseMessage[] {
    return history.map((message) => {
      switch (message.role) {
        case "user":
          return new HumanMessage(message.content);
        case "assistant":
          return new AIMessage(message.content);
        case "system":
          return new SystemMessage(message.content);
        default:
          return new HumanMessage(message.content);
      }
    });
  }

  protected calculateConfidence(result: any): number {
    // Default confidence calculation - can be overridden
    if (result.intermediateSteps && result.intermediateSteps.length > 0) {
      return Math.min(0.8 + result.intermediateSteps.length * 0.05, 1.0);
    }
    return 0.6; // Base confidence
  }

  protected extractToolsUsed(intermediateSteps: any[]): string[] {
    return intermediateSteps
      .filter((step) => step.action && step.action.tool)
      .map((step) => step.action.tool);
  }

  protected extractReasoning(result: any): string {
    if (result.intermediateSteps && result.intermediateSteps.length > 0) {
      const reasoning = result.intermediateSteps
        .map((step: any) => step.action?.log || "")
        .filter(Boolean)
        .join(" ");
      return reasoning || "Agent completed successfully";
    }
    return "Direct response without tool usage";
  }

  protected suggestNextActions(
    output: TOutput,
    input: AgentInput<TInput>
  ): string[] {
    // Default implementation - can be overridden
    return [];
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }
}
