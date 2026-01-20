import { DocumentChunk } from '../processing/semantic-chunker';
import { ChunkMetadata, QueryOptions, QueryResult } from './chroma-service';

/**
 * Mock vector service for development and testing
 * Uses simple cosine similarity without requiring a ChromaDB server
 */
export class MockVectorService {
  private storage: Map<string, { chunks: DocumentChunk[], embeddings: number[][], metadata: ChunkMetadata[] }> = new Map();

  /**
   * Initialize mock service (always succeeds)
   */
  async initialize(): Promise<void> {
    console.log('MockVectorService initialized (in-memory)');
  }

  /**
   * Add document chunks with embeddings
   */
  async addDocumentChunks(
    projectId: string,
    chunks: DocumentChunk[],
    embeddings: number[][]
  ): Promise<void> {
    if (chunks.length !== embeddings.length) {
      throw new Error('Number of chunks must match number of embeddings');
    }

    const metadata = chunks.map(chunk => this.chunkToMetadata(chunk));

    this.storage.set(projectId, {
      chunks,
      embeddings,
      metadata
    });

    console.log(`MockVectorService: Added ${chunks.length} chunks for project ${projectId}`);
  }

  /**
   * Query chunks by semantic similarity using cosine similarity
   */
  async queryBySemanticSimilarity(
    projectId: string,
    queryEmbedding: number[],
    options: QueryOptions = {}
  ): Promise<QueryResult> {
    const data = this.storage.get(projectId);
    if (!data) {
      return {
        ids: [],
        documents: [],
        metadatas: [],
        distances: []
      };
    }

    const { chunks, embeddings, metadata } = data;
    const maxResults = options.n_results || 10;

    // Calculate similarities
    const similarities = embeddings.map((embedding, index) => ({
      index,
      similarity: this.cosineSimilarity(queryEmbedding, embedding),
      distance: 1 - this.cosineSimilarity(queryEmbedding, embedding) // ChromaDB uses distance (lower is better)
    }));

    // Sort by similarity (higher is better) and take top results
    similarities.sort((a, b) => b.similarity - a.similarity);
    const topResults = similarities.slice(0, maxResults);

    return {
      ids: topResults.map(r => chunks[r.index].id),
      documents: topResults.map(r => chunks[r.index].content),
      metadatas: topResults.map(r => metadata[r.index]),
      distances: topResults.map(r => r.distance)
    };
  }

  /**
   * Delete project collection
   */
  async deleteProjectCollection(projectId: string): Promise<void> {
    this.storage.delete(projectId);
    console.log(`MockVectorService: Deleted collection for project ${projectId}`);
  }

  /**
   * Health check (always passes)
   */
  async healthCheck(): Promise<boolean> {
    return true;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Convert DocumentChunk to ChunkMetadata
   */
  private chunkToMetadata(chunk: DocumentChunk): ChunkMetadata {
    return {
      chunk_id: chunk.id,
      document_id: chunk.document_id,
      chunk_type: chunk.chunk_type,
      hierarchy_level: chunk.hierarchy_level,
      position: chunk.position,
      tokens: chunk.tokens,
      heading_path: chunk.heading_path.join(' > '),
      topic_keywords: chunk.topic_keywords.join(', '),
      semantic_density: chunk.semantic_density,
      chunking_method: chunk.metadata.chunking_method,
      created_at: chunk.metadata.created_at.toISOString(),
      source_file_id: chunk.metadata.source_file_id,
      source_file_name: chunk.metadata.source_file_name
    };
  }

  /**
   * Close connections (no-op for mock)
   */
  async close(): Promise<void> {
    this.storage.clear();
  }
}