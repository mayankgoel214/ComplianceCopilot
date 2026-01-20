import { z } from "zod";
import { BaseTool } from "./base-tool";
import { getVectorService } from "../../vector/chroma-service";
import { getGeminiEmbeddingService } from "../../ai/gemini-embeddings";
import { testingDataService } from "../../services/testing-data-service";

const VectorRetrievalSchema = z.object({
  projectId: z.string(),
  query: z.string(),
  limit: z.number().optional().default(10),
  threshold: z.number().optional().default(0.7),
  filters: z
    .object({
      documentId: z.string().optional(),
      chunkType: z.string().optional(),
      hierarchyLevel: z.number().optional(),
    })
    .optional(),
});

export class VectorRetrievalTool extends BaseTool {
  constructor() {
    super({
      name: "vector_retrieval",
      description:
        "Retrieve relevant document chunks using semantic similarity search from ChromaDB vector store",
      schema: VectorRetrievalSchema,
      category: "retrieval",
      fallbackConfig: {
        enabled: true,
        maxRetries: 3,
        retryDelayMs: 2000,
        circuitBreakerThreshold: 5,
      },
    });
  }

  protected async _call(arg: string): Promise<string> {
    try {
      // Validate input
      if (!arg || typeof arg !== "string") {
        throw new Error("Invalid input: argument must be a non-empty string");
      }

      let input: any;
      try {
        input = JSON.parse(arg);
      } catch (parseError) {
        throw new Error(
          `Invalid JSON input: ${
            parseError instanceof Error ? parseError.message : "Parse failed"
          }`
        );
      }

      const { projectId, query, limit, threshold, filters } =
        VectorRetrievalSchema.parse(input);

      // Check if testing mode is enabled
      if (testingDataService.isTestingMode()) {
        console.log(`🔧 Testing mode: Vector search for query "${query}"`);
        const testingResults = testingDataService.getVectorSearchResults(query);
        return JSON.stringify(testingResults, null, 2);
      }

      // Validate required fields
      if (!projectId || !query) {
        throw new Error(
          "Missing required fields: projectId and query are required"
        );
      }

      if (query.length < 3) {
        throw new Error("Query must be at least 3 characters long");
      }

      // Get services with error handling
      let vectorService: any;
      let embeddingService: any;

      try {
        vectorService = await getVectorService();
        console.log(`Vector service initialized: ${vectorService.constructor.name}`);

        // Check if collections exist for this project
        try {
          const collectionInfo = await vectorService.getCollectionInfo(projectId);
          console.log(`Collection info for project ${projectId}:`, collectionInfo);
        } catch (collectionError) {
          console.log(`Collection check failed for project ${projectId}:`, collectionError.message);
        }
      } catch (vectorError) {
        throw new Error(
          `Vector service unavailable: ${
            vectorError instanceof Error ? vectorError.message : "Unknown error"
          }`
        );
      }

      try {
        embeddingService = getGeminiEmbeddingService();
      } catch (embedError) {
        throw new Error(
          `Embedding service unavailable: ${
            embedError instanceof Error ? embedError.message : "Unknown error"
          }`
        );
      }

      // Generate embedding for the query with timeout
      let queryEmbedding: number[];
      try {
        const embeddingPromise = embeddingService.generateQueryEmbedding(query);
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Embedding generation timeout")),
            10000
          )
        );

        queryEmbedding = await Promise.race([embeddingPromise, timeoutPromise]);

        if (!queryEmbedding || queryEmbedding.length === 0) {
          throw new Error("Empty embedding generated");
        }
      } catch (embedError) {
        throw new Error(
          `Embedding generation failed: ${
            embedError instanceof Error ? embedError.message : "Unknown error"
          }`
        );
      }

      // Build query options
      const queryOptions: any = {
        n_results: Math.min(limit || 10, 100), // Cap at 100 results
        include: ["metadatas", "documents", "distances"],
      };

      // Add filters if provided
      if (filters) {
        const where: any = {};
        if (filters.documentId) where.document_id = filters.documentId;
        if (filters.chunkType) where.chunk_type = filters.chunkType;
        if (filters.hierarchyLevel !== undefined)
          where.hierarchy_level = filters.hierarchyLevel;

        if (Object.keys(where).length > 0) {
          queryOptions.where = where;
        }
      }

      // Perform similarity search with timeout
      let results: any;
      try {
        console.log(`Starting vector search for query: "${query}" in project: ${projectId}`);
        console.log(`Query options:`, queryOptions);
        console.log(`Query embedding length: ${queryEmbedding.length}`);

        const searchPromise = vectorService.queryBySemanticSimilarity(
          projectId,
          queryEmbedding,
          queryOptions
        );
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Vector search timeout")), 15000)
        );

        results = await Promise.race([searchPromise, timeoutPromise]);

        console.log(`Raw search results:`, {
          totalIds: results.ids?.length || 0,
          totalDocuments: results.documents?.length || 0,
          totalDistances: results.distances?.length || 0,
          sampleDocuments: results.documents?.slice(0, 3)?.map((doc: string) => doc.substring(0, 100) + "...")
        });

        if (!results || !Array.isArray(results.ids)) {
          throw new Error("Invalid search results format");
        }
      } catch (searchError) {
        console.error(`Vector search error:`, searchError);
        throw new Error(
          `Vector search failed: ${
            searchError instanceof Error ? searchError.message : "Unknown error"
          }`
        );
      }

      // Filter by threshold
      const filteredResults = {
        ids: [] as string[],
        documents: [] as string[],
        metadatas: [] as any[],
        distances: [] as number[],
      };

      console.log(`Filtering results with threshold: ${threshold} (distance threshold: ${1 - threshold})`);

      for (let i = 0; i < results.distances.length; i++) {
        const distance = results.distances[i];
        const similarity = 1 - distance;
        const passesThreshold = distance <= 1 - threshold;

        console.log(`Result ${i}: distance=${distance.toFixed(4)}, similarity=${similarity.toFixed(4)}, passes=${passesThreshold}, preview="${results.documents[i]?.substring(0, 50)}..."`);

        if (passesThreshold) {
          // ChromaDB uses distance, lower is better
          filteredResults.ids.push(results.ids[i]);
          filteredResults.documents.push(results.documents[i]);
          filteredResults.metadatas.push(results.metadatas[i]);
          filteredResults.distances.push(results.distances[i]);
        }
      }

      console.log(`Filtered results: ${filteredResults.ids.length} out of ${results.ids.length} passed threshold`);

      // Handle case where no results are found
      if (filteredResults.ids.length === 0) {
        const response = {
          query,
          resultsFound: 0,
          totalResults: results.ids.length,
          threshold,
          chunks: [],
          message: "No relevant documents found for this query. This project may not have any uploaded documents yet.",
          executionTime: Date.now(),
          serviceInfo: {
            vectorService: vectorService.constructor.name,
            embeddingService: embeddingService.constructor.name,
          },
        };
        return JSON.stringify(response, null, 2);
      }

      // Format response for agent
      const response = {
        query,
        resultsFound: filteredResults.ids.length,
        totalResults: results.ids.length,
        threshold,
        chunks: filteredResults.ids.map((id, index) => ({
          id,
          content: filteredResults.documents[index],
          metadata: filteredResults.metadatas[index],
          similarity: 1 - filteredResults.distances[index], // Convert distance to similarity
          relevanceScore:
            Math.round((1 - filteredResults.distances[index]) * 100) / 100,
        })),
        executionTime: Date.now(),
        serviceInfo: {
          vectorService: vectorService.constructor.name,
          embeddingService: embeddingService.constructor.name,
        },
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      // Enhanced error logging
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error("VectorRetrievalTool execution failed:", {
        error: errorMessage,
        stack: errorStack,
        input: arg,
        timestamp: new Date().toISOString(),
      });

      throw new Error(`Vector retrieval failed: ${errorMessage}`);
    }
  }

  async healthCheck(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Test vector service (with fallback)
      const vectorService = await getVectorService();
      const vectorHealthy = await vectorService.healthCheck();

      if (!vectorHealthy) {
        issues.push("Vector service is not healthy (using fallback)");
      }

      // Test embedding service
      const embeddingService = getGeminiEmbeddingService();
      const embeddingHealthy = await embeddingService.healthCheck();

      if (!embeddingHealthy) {
        issues.push("Gemini embedding service is not healthy");
      }

      // Test basic functionality with a simple query
      try {
        const testEmbedding = await embeddingService.generateQueryEmbedding(
          "test"
        );
        if (testEmbedding.length === 0) {
          issues.push("Embedding generation returned empty result");
        }
      } catch (embedError) {
        issues.push(
          `Embedding test failed: ${
            embedError instanceof Error ? embedError.message : "Unknown error"
          }`
        );
      }

      // Determine status based on issues
      if (issues.length === 0) {
        return { status: "healthy", issues: [] };
      } else if (issues.some((issue) => issue.includes("fallback"))) {
        return { status: "degraded", issues };
      } else {
        return { status: "unhealthy", issues };
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
