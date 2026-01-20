import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  jest,
} from "@jest/globals";
import {
  VectorRetrievalTool,
  WebSearchTool,
  DocumentAnalysisTool,
  InterAgentCommunicationTool,
  getToolRegistry,
  initializeToolRegistry,
  checkToolsHealth,
  getSystemMetrics,
  checkToolDependencies,
  resetToolCircuitBreaker,
  getToolMetrics,
} from "../index";

// Mock external dependencies
jest.mock("../../../vector/chroma-service");
jest.mock("../../../ai/gemini-embeddings");
jest.mock("../../../ai/gemini-service");
jest.mock("../../../processing/document-processor");

describe("Tool Integration Tests", () => {
  let registry: any;

  beforeEach(() => {
    // Clear any existing registry
    registry = getToolRegistry();
    // Clear all tools
    const tools = registry.list();
    tools.forEach((tool: any) => registry.unregister(tool.name));
  });

  afterEach(() => {
    // Clean up
    const tools = registry.list();
    tools.forEach((tool: any) => registry.unregister(tool.name));
  });

  describe("Tool Registration and Health Checks", () => {
    it("should register tools successfully", () => {
      const vectorTool = new VectorRetrievalTool();
      const webTool = new WebSearchTool();
      const analysisTool = new DocumentAnalysisTool();

      registry.register(vectorTool);
      registry.register(webTool);
      registry.register(analysisTool);

      expect(registry.list()).toHaveLength(3);
      expect(registry.get("vector_retrieval")).toBeDefined();
      expect(registry.get("web_search")).toBeDefined();
      expect(registry.get("document_analysis")).toBeDefined();
    });

    it("should perform health checks on all tools", async () => {
      const vectorTool = new VectorRetrievalTool();
      const webTool = new WebSearchTool();

      registry.register(vectorTool);
      registry.register(webTool);

      const healthResults = await checkToolsHealth();

      expect(healthResults).toHaveProperty("vector_retrieval");
      expect(healthResults).toHaveProperty("web_search");
      expect(healthResults.vector_retrieval).toHaveProperty("status");
      expect(healthResults.vector_retrieval).toHaveProperty("issues");
    });

    it("should track performance metrics", () => {
      const vectorTool = new VectorRetrievalTool();
      registry.register(vectorTool);

      const metrics = getToolMetrics("vector_retrieval");
      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty("totalExecutions", 0);
      expect(metrics).toHaveProperty("successfulExecutions", 0);
      expect(metrics).toHaveProperty("failedExecutions", 0);
      expect(metrics).toHaveProperty("errorRate", 0);
    });
  });

  describe("Circuit Breaker and Fallback Mechanisms", () => {
    it("should handle circuit breaker states", () => {
      const vectorTool = new VectorRetrievalTool();
      registry.register(vectorTool);

      // Initially closed
      let circuitState = vectorTool.getCircuitBreakerState();
      expect(circuitState.state).toBe("closed");

      // Reset circuit breaker
      vectorTool.resetCircuitBreaker();
      circuitState = vectorTool.getCircuitBreakerState();
      expect(circuitState.state).toBe("closed");
      expect(circuitState.failures).toBe(0);
    });

    it("should track system metrics", () => {
      const vectorTool = new VectorRetrievalTool();
      const webTool = new WebSearchTool();

      registry.register(vectorTool);
      registry.register(webTool);

      const systemMetrics = getSystemMetrics();
      expect(systemMetrics).toHaveProperty("totalTools", 2);
      expect(systemMetrics).toHaveProperty("healthyTools");
      expect(systemMetrics).toHaveProperty("degradedTools");
      expect(systemMetrics).toHaveProperty("unhealthyTools");
      expect(systemMetrics).toHaveProperty("systemErrorRate");
    });
  });

  describe("Dependency Management", () => {
    it("should check tool dependencies", async () => {
      const vectorTool = new VectorRetrievalTool();
      const analysisTool = new DocumentAnalysisTool(); // Has dependency on vector_retrieval

      registry.register(vectorTool);
      registry.register(analysisTool);

      const dependencyResults = await checkToolDependencies();
      expect(dependencyResults).toHaveProperty("satisfied");
      expect(dependencyResults).toHaveProperty("missing");
      expect(dependencyResults).toHaveProperty("circular");
      expect(dependencyResults).toHaveProperty("conflicts");
    });

    it("should handle missing dependencies", async () => {
      const analysisTool = new DocumentAnalysisTool(); // Has dependency on vector_retrieval
      registry.register(analysisTool);

      const dependencyResults = await checkToolDependencies();
      expect(dependencyResults.missing).toContain(
        "document_analysis -> vector_retrieval (missing)"
      );
    });
  });

  describe("Tool Execution with Error Handling", () => {
    it("should handle invalid input gracefully", async () => {
      const vectorTool = new VectorRetrievalTool();
      registry.register(vectorTool);

      // Test with invalid JSON
      await expect(vectorTool.call("invalid json")).rejects.toThrow();

      // Test with missing required fields
      await expect(vectorTool.call('{"projectId": "test"}')).rejects.toThrow();

      // Test with empty query
      await expect(
        vectorTool.call('{"projectId": "test", "query": ""}')
      ).rejects.toThrow();
    }, 10000);

    it("should handle service failures gracefully", async () => {
      const vectorTool = new VectorRetrievalTool();
      registry.register(vectorTool);

      // Mock service failure
      const mockGetVectorService = jest
        .fn()
        .mockRejectedValue(new Error("Service unavailable"));
      jest.doMock("../../../vector/chroma-service", () => ({
        getVectorService: mockGetVectorService,
      }));

      await expect(
        vectorTool.call('{"projectId": "test", "query": "test query"}')
      ).rejects.toThrow();
    });
  });

  describe("Communication Tool", () => {
    it("should handle agent communication", async () => {
      const commTool = new InterAgentCommunicationTool("test-agent-1");
      registry.register(commTool);

      // Test sending a message
      const sendResult = await commTool.call(
        JSON.stringify({
          action: "send",
          channel: "test-channel",
          targetAgent: "test-agent-2",
          message: { type: "test", data: "hello" },
        })
      );

      expect(sendResult).toContain("messageId");
      expect(sendResult).toContain("sent");

      // Test receiving messages
      const receiveResult = await commTool.call(
        JSON.stringify({
          action: "receive",
          channel: "test-channel",
        })
      );

      expect(receiveResult).toContain("messages");
      expect(receiveResult).toContain("count");
    });

    it("should handle broadcast messages", async () => {
      const commTool = new InterAgentCommunicationTool("test-agent-1");
      registry.register(commTool);

      const broadcastResult = await commTool.call(
        JSON.stringify({
          action: "broadcast",
          channel: "test-channel",
          message: { type: "announcement", data: "system update" },
        })
      );

      expect(broadcastResult).toContain("broadcasted");
      expect(broadcastResult).toContain("subscribersNotified");
    });
  });

  describe("Web Search Tool", () => {
    it("should handle search queries", async () => {
      const webTool = new WebSearchTool();
      registry.register(webTool);

      const searchResult = await webTool.call(
        JSON.stringify({
          query: "compliance regulations",
          maxResults: 3,
        })
      );

      expect(searchResult).toContain("query");
      expect(searchResult).toContain("results");
      expect(searchResult).toContain("resultsCount");
    });

    it("should handle compliance-focused queries", async () => {
      const webTool = new WebSearchTool();
      registry.register(webTool);

      const complianceResult = await webTool.call(
        JSON.stringify({
          query: "FERPA compliance requirements",
          maxResults: 5,
        })
      );

      expect(complianceResult).toContain("FERPA");
      expect(complianceResult).toContain("compliance");
    });
  });

  describe("Document Analysis Tool", () => {
    it("should handle document analysis", async () => {
      const analysisTool = new DocumentAnalysisTool();
      registry.register(analysisTool);

      const analysisResult = await analysisTool.call(
        JSON.stringify({
          documentId: "doc1",
          projectId: "test-project",
          analysisType: "compliance",
        })
      );

      expect(analysisResult).toContain("documentId");
      expect(analysisResult).toContain("analysisType");
      expect(analysisResult).toContain("result");
    });

    it("should handle different analysis types", async () => {
      const analysisTool = new DocumentAnalysisTool();
      registry.register(analysisTool);

      const riskResult = await analysisTool.call(
        JSON.stringify({
          documentId: "doc2",
          projectId: "test-project",
          analysisType: "risk",
        })
      );

      expect(riskResult).toContain("riskLevel");
      expect(riskResult).toContain("riskFactors");
    });
  });

  describe("Failure Scenarios", () => {
    it("should handle tool timeouts", async () => {
      const vectorTool = new VectorRetrievalTool();
      registry.register(vectorTool);

      // Mock a slow service
      const mockGenerateQueryEmbedding = jest.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 15000)) // 15 second delay
      );

      jest.doMock("../../../ai/gemini-embeddings", () => ({
        getGeminiEmbeddingService: () => ({
          generateQueryEmbedding: mockGenerateQueryEmbedding,
          healthCheck: () => Promise.resolve(true),
        }),
      }));

      await expect(
        vectorTool.call('{"projectId": "test", "query": "test query"}')
      ).rejects.toThrow("timeout");
    });

    it("should handle circuit breaker activation", () => {
      const vectorTool = new VectorRetrievalTool();
      registry.register(vectorTool);

      // Simulate multiple failures to trigger circuit breaker
      // Access private properties for testing
      const privateTool = vectorTool as any;
      privateTool.circuitBreakerFailures = 6; // Exceed threshold of 5
      privateTool.lastFailureTime = new Date();

      const circuitState = vectorTool.getCircuitBreakerState();
      expect(circuitState.state).toBe("open");
    });

    it("should handle registry errors gracefully", () => {
      // Test unregistering non-existent tool
      expect(() => registry.unregister("non-existent-tool")).not.toThrow();

      // Test getting non-existent tool
      expect(registry.get("non-existent-tool")).toBeUndefined();
    });
  });

  describe("System Integration", () => {
    it("should initialize tool registry with all tools", () => {
      initializeToolRegistry();

      const tools = registry.list();
      expect(tools.length).toBeGreaterThan(0);

      // Check that core tools are registered
      const toolNames = tools.map((tool: any) => tool.name);
      expect(toolNames).toContain("vector_retrieval");
      expect(toolNames).toContain("web_search");
      expect(toolNames).toContain("document_analysis");
    });

    it("should provide comprehensive system status", async () => {
      initializeToolRegistry();

      const healthResults = await checkToolsHealth();
      const systemMetrics = getSystemMetrics();
      const dependencyResults = await checkToolDependencies();

      expect(Object.keys(healthResults).length).toBeGreaterThan(0);
      expect(systemMetrics.totalTools).toBeGreaterThan(0);
      expect(dependencyResults).toHaveProperty("satisfied");
    });
  });
});
