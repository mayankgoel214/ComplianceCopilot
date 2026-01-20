import { ChromaClient, Collection } from "chromadb";
import { DocumentChunk } from "../processing/semantic-chunker";
import {
  ChromaConfig,
  DEFAULT_CHROMA_CONFIG,
  COLLECTION_SETTINGS,
  getCollectionName,
  validateProjectId,
} from "./chroma-config";
import { sql } from "../db/neon-client";

export interface ChunkMetadata {
  chunk_id: string;
  document_id: string;
  chunk_type: string;
  hierarchy_level: number;
  position: number;
  tokens: number;
  heading_path: string;
  topic_keywords: string;
  semantic_density: number;
  chunking_method: string;
  created_at: string;
  source_file_id: string;
  source_file_name: string;
}

export interface QueryOptions {
  n_results?: number;
  where?: Record<string, any>;
  where_document?: Record<string, any>;
  include?: ("metadatas" | "documents" | "distances" | "embeddings")[];
}

export interface QueryResult {
  ids: string[];
  documents: string[];
  metadatas: ChunkMetadata[];
  distances: number[];
  embeddings?: number[][];
}

export interface CollectionInfo {
  name: string;
  count: number;
  metadata: Record<string, any>;
}

export class ChromaVectorService {
  private client: ChromaClient | null = null;
  private readonly collections: Map<string, Collection> = new Map();
  private readonly config: ChromaConfig;
  private initialized = false;

  constructor(config: Partial<ChromaConfig> = {}) {
    this.config = { ...DEFAULT_CHROMA_CONFIG, ...config };
  }

  /**
   * Initialize ChromaDB client with persistence
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Try in-memory mode first for development/testing
      try {
        this.client = new ChromaClient();
        // Test the connection with a simple operation
        await this.client.heartbeat();
        this.initialized = true;
        console.log("ChromaDB initialized in in-memory mode");
        return;
      } catch (memoryError) {
        console.log(
          "In-memory mode failed, trying server mode...",
          memoryError
        );
        this.client = null;
      }

      // Fallback to server mode
      try {
        this.client = new ChromaClient({
          host: this.config.host || "localhost",
          port: this.config.port || 8000,
          ssl: this.config.ssl || false,
          headers: this.config.headers || {},
        });

        // Test the connection with a simple operation
        await this.client.heartbeat();
        this.initialized = true;
        console.log(
          `ChromaDB initialized with host: ${this.config.host || "localhost"}:${
            this.config.port || 8000
          }`
        );
        return;
      } catch (serverError) {
        console.log("Server mode failed:", serverError);
        this.client = null;
      }

      // If both modes fail, throw an error
      throw new Error(
        "Both in-memory and server modes failed to initialize ChromaDB"
      );
    } catch (error) {
      console.error("Failed to initialize ChromaDB:", error);
      this.client = null;
      this.initialized = false;
      throw new Error(`ChromaDB initialization failed: ${error}`);
    }
  }

  /**
   * Get or create a collection for a specific project
   */
  async getOrCreateCollection(projectId: string): Promise<Collection> {
    await this.ensureInitialized();

    if (!validateProjectId(projectId)) {
      throw new Error(`Invalid project ID format: ${projectId}`);
    }

    const collectionName = getCollectionName(projectId);

    // Return cached collection if available
    if (this.collections.has(collectionName)) {
      return this.collections.get(collectionName)!;
    }

    try {
      // Try to get existing collection
      const collection = await this.client!.getCollection({
        name: collectionName,
      });

      this.collections.set(collectionName, collection);
      return collection;
    } catch (error) {
      // Collection doesn't exist, create it
      console.log(`Creating new collection: ${collectionName}`);
      return await this.createCollection(projectId, collectionName);
    }
  }

  /**
   * Create a new collection for a project
   */
  private async createCollection(
    projectId: string,
    collectionName: string
  ): Promise<Collection> {
    if (!this.client) {
      throw new Error("ChromaDB client not initialized");
    }

    try {
      const collection = await this.client.createCollection({
        name: collectionName,
        embeddingFunction: null, // We provide our own embeddings from Gemini
        metadata: {
          project_id: projectId,
          embedding_function:
            this.config.collection_metadata.embedding_function,
          hnsw_space: this.config.collection_metadata.hnsw_space,
          created_at: new Date().toISOString(),
        },
      });

      // Track collection in database
      await this.trackCollectionInDB(projectId, collectionName);

      this.collections.set(collectionName, collection);
      return collection;
    } catch (error) {
      console.error(`Failed to create collection ${collectionName}:`, error);
      throw new Error(`Collection creation failed: ${error}`);
    }
  }

  /**
   * Track collection in Neon database
   */
  private async trackCollectionInDB(
    projectId: string,
    collectionName: string
  ): Promise<void> {
    try {
      await sql`
        INSERT INTO vector_collections (project_id, collection_name, chunk_count, last_updated)
        VALUES (${projectId}, ${collectionName}, 0, CURRENT_TIMESTAMP)
        ON CONFLICT (project_id)
        DO UPDATE SET
          collection_name = EXCLUDED.collection_name,
          last_updated = CURRENT_TIMESTAMP
      `;
    } catch (error) {
      console.error("Failed to track collection in database:", error);
      // Don't throw here as ChromaDB collection was created successfully
    }
  }

  /**
   * Add document chunks to a project's collection with embeddings
   */
  async addDocumentChunks(
    projectId: string,
    chunks: DocumentChunk[],
    embeddings: number[][]
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error("Number of chunks must match number of embeddings");
    }

    const collection = await this.getOrCreateCollection(projectId);

    // Process in batches to avoid memory issues
    const batchSize = COLLECTION_SETTINGS.max_batch_size;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const chunkBatch = chunks.slice(i, i + batchSize);
      const embeddingBatch = embeddings.slice(i, i + batchSize);

      await this.addChunkBatch(collection, chunkBatch, embeddingBatch);
    }

    // Update collection count in database
    await this.updateCollectionCount(projectId, chunks.length);
  }

  /**
   * Add a batch of chunks to collection
   */
  private async addChunkBatch(
    collection: Collection,
    chunks: DocumentChunk[],
    embeddings: number[][]
  ): Promise<void> {
    const ids = chunks.map((chunk) => chunk.id);
    const documents = chunks.map((chunk) => chunk.content);
    const metadatas = chunks.map((chunk) => this.chunkToMetadata(chunk));

    try {
      await collection.add({
        ids,
        documents,
        embeddings,
        metadatas,
      });

      console.log(`Added ${chunks.length} chunks to collection`);
    } catch (error) {
      console.error("Failed to add chunk batch:", error);
      throw new Error(`Batch insertion failed: ${error}`);
    }
  }

  /**
   * Convert DocumentChunk to ChromaDB metadata
   */
  private chunkToMetadata(chunk: DocumentChunk): ChunkMetadata {
    return {
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      chunk_type: chunk.chunk_type,
      hierarchy_level: chunk.hierarchy_level,
      position: chunk.position,
      tokens: chunk.tokens,
      heading_path: chunk.heading_path.join(" > "),
      topic_keywords: chunk.topic_keywords.join(", "),
      semantic_density: chunk.semantic_density,
      chunking_method: chunk.metadata.chunking_method,
      created_at: chunk.metadata.created_at.toISOString(),
      source_file_id: chunk.metadata.source_file_id,
      source_file_name: chunk.metadata.source_file_name,
    };
  }

  /**
   * Query chunks by semantic similarity
   */
  async queryBySemanticSimilarity(
    projectId: string,
    queryEmbedding: number[],
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    const collection = await this.getOrCreateCollection(projectId);

    const defaultOptions: QueryOptions = {
      n_results: 10,
      include: ["metadatas", "documents", "distances"],
    };

    const finalOptions = { ...defaultOptions, ...options };

    try {
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: finalOptions.n_results,
        where: finalOptions.where,
        whereDocument: finalOptions.where_document,
        include: finalOptions.include,
      });

      return {
        ids: results.ids[0] || [],
        documents: results.documents?.[0] || [],
        metadatas: (results.metadatas?.[0] || []) as ChunkMetadata[],
        distances: results.distances?.[0] || [],
        embeddings: results.embeddings?.[0] || undefined,
      };
    } catch (error) {
      console.error("Query failed:", error);
      throw new Error(`Semantic query failed: ${error}`);
    }
  }

  /**
   * Get chunks by document ID
   */
  async getChunksByDocument(
    projectId: string,
    documentId: string
  ): Promise<QueryResult> {
    return this.queryBySemanticSimilarity(projectId, [], {
      n_results: 1000, // Large number to get all chunks
      where: { document_id: documentId },
      include: ["metadatas", "documents"],
    });
  }

  /**
   * Get chunks by hierarchy level
   */
  async getChunksByHierarchyLevel(
    projectId: string,
    level: number,
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    return this.queryBySemanticSimilarity(projectId, [], {
      ...options,
      where: { hierarchy_level: level },
      include: ["metadatas", "documents"],
    });
  }

  /**
   * Get chunks by heading path
   */
  async getChunksByHeadingPath(
    projectId: string,
    headingPath: string,
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    return this.queryBySemanticSimilarity(projectId, [], {
      ...options,
      where_document: { $contains: headingPath },
      include: ["metadatas", "documents"],
    });
  }

  /**
   * Get all chunks for a project
   */
  async getAllChunks(projectId: string): Promise<QueryResult> {
    const collection = await this.getOrCreateCollection(projectId);

    try {
      const results = await collection.get({
        include: ["metadatas", "documents"],
      });

      return {
        ids: results.ids,
        documents: results.documents || [],
        metadatas: (results.metadatas || []) as ChunkMetadata[],
        distances: [],
      };
    } catch (error) {
      console.error("Failed to get all chunks:", error);
      throw new Error(`Get all chunks failed: ${error}`);
    }
  }

  /**
   * Delete chunks by document ID
   */
  async deleteChunksByDocument(
    projectId: string,
    documentId: string
  ): Promise<void> {
    const collection = await this.getOrCreateCollection(projectId);

    try {
      await collection.delete({
        where: { document_id: documentId },
      });

      console.log(`Deleted chunks for document ${documentId}`);
    } catch (error) {
      console.error("Failed to delete chunks:", error);
      throw new Error(`Chunk deletion failed: ${error}`);
    }
  }

  /**
   * Delete entire project collection
   */
  async deleteProjectCollection(projectId: string): Promise<void> {
    if (!validateProjectId(projectId)) {
      throw new Error(`Invalid project ID format: ${projectId}`);
    }

    await this.ensureInitialized();

    const collectionName = getCollectionName(projectId);

    try {
      // Delete from ChromaDB
      await this.client!.deleteCollection({ name: collectionName });

      // Remove from cache
      this.collections.delete(collectionName);

      // Remove from database tracking
      await sql`
        DELETE FROM vector_collections
        WHERE project_id = ${projectId}
      `;

      console.log(`Deleted collection for project ${projectId}`);
    } catch (error) {
      console.error("Failed to delete collection:", error);
      throw new Error(`Collection deletion failed: ${error}`);
    }
  }

  /**
   * Get collection information
   */
  async getCollectionInfo(projectId: string): Promise<CollectionInfo | null> {
    try {
      const collection = await this.getOrCreateCollection(projectId);
      const count = await collection.count();
      const collectionName = getCollectionName(projectId);

      return {
        name: collectionName,
        count,
        metadata: {
          project_id: projectId,
          embedding_function:
            this.config.collection_metadata.embedding_function,
        },
      };
    } catch (error) {
      console.error("Failed to get collection info:", error);
      return null;
    }
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<CollectionInfo[]> {
    await this.ensureInitialized();

    try {
      const collections = await this.client!.listCollections();
      const infos: CollectionInfo[] = [];

      for (const collection of collections) {
        const count = await collection.count();
        infos.push({
          name: collection.name,
          count,
          metadata: collection.metadata || {},
        });
      }

      return infos;
    } catch (error) {
      console.error("Failed to list collections:", error);
      return [];
    }
  }

  /**
   * Update collection count in database
   */
  private async updateCollectionCount(
    projectId: string,
    additionalChunks: number
  ): Promise<void> {
    try {
      await sql`
        UPDATE vector_collections
        SET
          chunk_count = chunk_count + ${additionalChunks},
          last_updated = CURRENT_TIMESTAMP
        WHERE project_id = ${projectId}
      `;
    } catch (error) {
      console.error("Failed to update collection count:", error);
      // Don't throw as this is not critical for functionality
    }
  }

  /**
   * Health check for ChromaDB service
   */
  async healthCheck(): Promise<boolean> {
    try {
      // If not initialized, try to initialize
      if (!this.initialized) {
        try {
          await this.initialize();
        } catch (initError) {
          console.log("ChromaDB initialization failed during health check:", initError.message);
          return false;
        }
      }

      // If still no client, it's unhealthy
      if (!this.client) {
        console.log("ChromaDB client is null after initialization");
        return false;
      }

      // Try a simple heartbeat operation
      try {
        await this.client.heartbeat();
        console.log("ChromaDB health check passed");
        return true;
      } catch (heartbeatError) {
        console.log("ChromaDB heartbeat failed:", heartbeatError.message);
        return false;
      }
    } catch (error) {
      console.log("ChromaDB health check failed:", error.message);
      return false;
    }
  }

  /**
   * Force unhealthy state for testing fallback mechanisms
   */
  forceUnhealthy(): void {
    this.client = null;
    this.initialized = false;
  }

  /**
   * Ensure ChromaDB client is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Close connections and cleanup
   */
  async close(): Promise<void> {
    this.collections.clear();
    this.client = null;
    this.initialized = false;
  }
}

// Singleton instance for the application
let chromaServiceInstance: ChromaVectorService | null = null;

export function getChromaService(): ChromaVectorService {
  chromaServiceInstance ??= new ChromaVectorService();
  return chromaServiceInstance;
}

/**
 * Get vector service - ChromaDB only, no fallback to mock
 * This ensures we use the real ChromaDB service
 */
export async function getVectorService(): Promise<ChromaVectorService> {
  const chromaService = getChromaService();

  // Initialize if not already done
  if (!chromaService.initialized) {
    await chromaService.initialize();
  }

  // Verify the service is healthy
  const isHealthy = await chromaService.healthCheck();
  if (!isHealthy) {
    throw new Error("ChromaDB service is not healthy. Please ensure ChromaDB server is running on localhost:8000");
  }

  return chromaService;
}
