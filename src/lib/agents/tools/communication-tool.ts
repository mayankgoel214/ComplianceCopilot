import { z } from "zod";
import { BaseTool } from "./base-tool";

const CommunicationSchema = z.object({
  action: z.enum(["send", "receive", "broadcast", "subscribe"]),
  channel: z.string(),
  message: z.any().optional(),
  targetAgent: z.string().optional(),
  messageType: z
    .enum(["data", "status", "request", "response"])
    .optional()
    .default("data"),
});

interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent?: string;
  channel: string;
  messageType: "data" | "status" | "request" | "response";
  payload: any;
  timestamp: Date;
  ttl?: number; // Time to live in milliseconds
}

class InterAgentCommunicationService {
  private channels = new Map<string, AgentMessage[]>();
  private subscribers = new Map<string, Set<string>>();
  private maxChannelHistory = 100;
  private messageTTL = 5 * 60 * 1000; // 5 minutes

  sendMessage(
    fromAgent: string,
    toAgent: string | undefined,
    channel: string,
    message: any,
    messageType: "data" | "status" | "request" | "response" = "data"
  ): string {
    const messageId = this.generateMessageId();
    const agentMessage: AgentMessage = {
      id: messageId,
      fromAgent,
      toAgent,
      channel,
      messageType,
      payload: message,
      timestamp: new Date(),
      ttl: Date.now() + this.messageTTL,
    };

    // Store message in channel
    if (!this.channels.has(channel)) {
      this.channels.set(channel, []);
    }

    const channelMessages = this.channels.get(channel)!;
    channelMessages.push(agentMessage);

    // Maintain channel history limit
    if (channelMessages.length > this.maxChannelHistory) {
      channelMessages.splice(
        0,
        channelMessages.length - this.maxChannelHistory
      );
    }

    // Clean expired messages
    this.cleanExpiredMessages();

    return messageId;
  }

  receiveMessages(
    agent: string,
    channel: string,
    since?: Date
  ): AgentMessage[] {
    const channelMessages = this.channels.get(channel) || [];
    const cutoff = since || new Date(Date.now() - this.messageTTL);

    return channelMessages.filter(
      (msg) =>
        (msg.toAgent === agent || msg.toAgent === undefined) &&
        msg.fromAgent !== agent &&
        msg.timestamp >= cutoff &&
        (!msg.ttl || msg.ttl > Date.now())
    );
  }

  broadcast(
    fromAgent: string,
    channel: string,
    message: any,
    messageType: "data" | "status" | "request" | "response" = "data"
  ): string {
    return this.sendMessage(
      fromAgent,
      undefined,
      channel,
      message,
      messageType
    );
  }

  subscribe(agent: string, channel: string): void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(agent);
  }

  unsubscribe(agent: string, channel: string): void {
    const channelSubscribers = this.subscribers.get(channel);
    if (channelSubscribers) {
      channelSubscribers.delete(agent);
    }
  }

  getSubscribers(channel: string): string[] {
    return Array.from(this.subscribers.get(channel) || []);
  }

  listChannels(): string[] {
    return Array.from(this.channels.keys());
  }

  getChannelInfo(channel: string): {
    messageCount: number;
    subscribers: string[];
    lastActivity?: Date;
  } {
    const messages = this.channels.get(channel) || [];
    const lastMessage = messages[messages.length - 1];

    return {
      messageCount: messages.length,
      subscribers: this.getSubscribers(channel),
      lastActivity: lastMessage?.timestamp,
    };
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private cleanExpiredMessages(): void {
    const now = Date.now();
    for (const [channel, messages] of this.channels) {
      const validMessages = messages.filter((msg) => !msg.ttl || msg.ttl > now);
      this.channels.set(channel, validMessages);
    }
  }

  // Clear old data periodically
  cleanup(): void {
    this.cleanExpiredMessages();

    // Remove empty channels
    for (const [channel, messages] of this.channels) {
      if (messages.length === 0) {
        this.channels.delete(channel);
        this.subscribers.delete(channel);
      }
    }
  }
}

// Singleton instance
let communicationServiceInstance: InterAgentCommunicationService | null = null;

function getCommunicationService(): InterAgentCommunicationService {
  if (!communicationServiceInstance) {
    communicationServiceInstance = new InterAgentCommunicationService();

    // Setup periodic cleanup
    setInterval(() => {
      communicationServiceInstance!.cleanup();
    }, 60000); // Clean every minute
  }
  return communicationServiceInstance;
}

export class InterAgentCommunicationTool extends BaseTool {
  private agentId: string;

  constructor(agentId: string) {
    // Create a short, valid function name to avoid 64-character limit
    // Only use alphanumeric characters and underscores
    const hash =
      Math.abs(
        agentId.split("").reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0)
      ) % 1000;
    const functionName = `agent_comm_${hash}`;

    super({
      name: functionName,
      description:
        "Send messages, share state, and coordinate with other agents in the multi-agent system",
      schema: CommunicationSchema,
      category: "communication",
      fallbackConfig: {
        enabled: false, // Communication tool doesn't need fallback as it's in-memory
        maxRetries: 1,
        retryDelayMs: 100,
        circuitBreakerThreshold: 10,
      },
    });
    this.agentId = agentId;
  }

  protected async _call(arg: string): Promise<string> {
    try {
      const input = JSON.parse(arg);
      const { action, channel, message, targetAgent, messageType } =
        CommunicationSchema.parse(input);

      const commService = getCommunicationService();
      let result: any = {};

      switch (action) {
        case "send":
          if (!targetAgent) {
            throw new Error("Target agent is required for send action");
          }
          const messageId = commService.sendMessage(
            this.agentId,
            targetAgent,
            channel,
            message,
            messageType
          );
          result = { messageId, status: "sent", channel, targetAgent };
          break;

        case "receive":
          const messages = commService.receiveMessages(this.agentId, channel);
          result = { messages, channel, count: messages.length };
          break;

        case "broadcast":
          const broadcastId = commService.broadcast(
            this.agentId,
            channel,
            message,
            messageType
          );
          const subscribers = commService.getSubscribers(channel);
          result = {
            messageId: broadcastId,
            status: "broadcasted",
            channel,
            subscribersNotified: subscribers.length,
          };
          break;

        case "subscribe":
          commService.subscribe(this.agentId, channel);
          result = { status: "subscribed", channel };
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return JSON.stringify(
        {
          action,
          agent: this.agentId,
          timestamp: new Date().toISOString(),
          result,
        },
        null,
        2
      );
    } catch (error) {
      throw new Error(
        `Inter-agent communication failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    issues: string[];
  }> {
    try {
      const commService = getCommunicationService();

      // Test basic functionality
      const testChannel = `health_check_${Date.now()}`;
      const messageId = commService.sendMessage(
        this.agentId,
        this.agentId,
        testChannel,
        { test: true }
      );
      const messages = commService.receiveMessages(this.agentId, testChannel);

      if (messages.length > 0 && messages[0].id === messageId) {
        return {
          status: "healthy",
          issues: [],
        };
      } else {
        return {
          status: "degraded",
          issues: ["Message send/receive test failed"],
        };
      }
    } catch (error) {
      return {
        status: "unhealthy",
        issues: [
          error instanceof Error ? error.message : "Health check failed",
        ],
      };
    }
  }
}

export { getCommunicationService, InterAgentCommunicationService };
