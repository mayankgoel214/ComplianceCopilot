/**
 * Centralized error logging utility for agent system
 */

export interface ErrorLogContext {
  agentId?: string;
  agentName?: string;
  projectId?: string;
  userId?: string;
  sessionId?: string;
  endpoint?: string;
  operation?: string;
  input?: unknown;
  context?: unknown;
  timestamp?: string;
}

export class ErrorLogger {
  private static instance: ErrorLogger;

  static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  logError(error: Error | unknown, context: ErrorLogContext = {}): void {
    const errorInfo = {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : "UnknownError",
      ...context,
      timestamp: context.timestamp || new Date().toISOString(),
    };

    // Log to console with structured format
    console.error("AGENT_ERROR:", JSON.stringify(errorInfo, null, 2));

    // In production, you might want to send to external logging service
    // await this.sendToExternalLogger(errorInfo);
  }

  logValidationError(
    validationErrors: string[],
    context: ErrorLogContext = {}
  ): void {
    const errorInfo = {
      type: "VALIDATION_ERROR",
      validationErrors,
      ...context,
      timestamp: context.timestamp || new Date().toISOString(),
    };

    console.error("VALIDATION_ERROR:", JSON.stringify(errorInfo, null, 2));
  }

  logAgentExecutionError(
    error: Error | unknown,
    agentId: string,
    input: unknown,
    context: unknown
  ): void {
    this.logError(error, {
      agentId,
      operation: "agent_execution",
      input: this.sanitizeForLogging(input),
      context: this.sanitizeForLogging(context),
    });
  }

  logEndpointError(
    error: Error | unknown,
    endpoint: string,
    requestBody?: unknown
  ): void {
    this.logError(error, {
      endpoint,
      operation: "endpoint_request",
      input: this.sanitizeForLogging(requestBody),
    });
  }

  private sanitizeForLogging(data: unknown): unknown {
    if (!data) return data;

    try {
      // Create a copy to avoid modifying original data
      const sanitized = JSON.parse(JSON.stringify(data));

      // Truncate long strings
      const truncateString = (str: string, maxLength: number = 500): string => {
        return str.length > maxLength
          ? str.substring(0, maxLength) + "..."
          : str;
      };

      // Recursively sanitize
      const sanitize = (obj: unknown): unknown => {
        if (typeof obj === "string") {
          return truncateString(obj);
        } else if (Array.isArray(obj)) {
          return obj.map(sanitize);
        } else if (obj && typeof obj === "object") {
          const result: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(obj)) {
            result[key] = sanitize(value);
          }
          return result;
        }
        return obj;
      };

      return sanitize(sanitized);
    } catch (error) {
      return "[Error sanitizing data for logging]";
    }
  }

  // Placeholder for external logging service integration
  private async sendToExternalLogger(errorInfo: unknown): Promise<void> {
    // In production, implement integration with services like:
    // - Sentry
    // - DataDog
    // - CloudWatch
    // - Custom logging service
    console.log("Would send to external logger:", errorInfo);
  }
}

// Export singleton instance
export const errorLogger = ErrorLogger.getInstance();
