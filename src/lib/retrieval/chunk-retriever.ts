import { getChromaService, QueryOptions, QueryResult } from '../vector/chroma-service';
import { getGeminiEmbeddingService } from '../ai/gemini-embeddings';
import { SemanticBoundaryDetector } from '../processing/semantic-analyzer';
import { AI_CONFIG } from '../ai/config';
import { sql } from '../db/neon-client';
import { DocumentChunk } from '../processing/semantic-chunker';

export interface RetrievalOptions {
  max_results?: number;
  similarity_threshold?: number;
  include_context?: boolean; // Include parent/child chunks
  context_window?: number; // Number of adjacent chunks to include
  filter_by_document?: string; // Filter to specific document
  filter_by_heading?: string; // Filter to specific heading path
  filter_by_type?: string; // Filter by chunk type
  hierarchy_level?: number; // Filter by hierarchy level
  boost_recent?: boolean; // Boost recently created chunks
}

export interface EnrichedChunk extends DocumentChunk {
  similarity_score?: number;
  context_chunks?: DocumentChunk[];
  parent_chunks?: DocumentChunk[];
  child_chunks?: DocumentChunk[];
  related_chunks?: DocumentChunk[];
}

export interface RetrievalResult {
  chunks: EnrichedChunk[];
  total_found: number;
  query_strategy: string;
  processing_time_ms: number;
  aggregated_metadata: {
    documents_covered: string[];
    heading_paths_covered: string[];
    hierarchy_levels: number[];
    average_similarity?: number;
  };
}

export type RetrievalStrategy = 'semantic' | 'hierarchical' | 'hybrid' | 'contextual' | 'keyword';

export class ChunkRetriever {
  private chromaService = getChromaService();
  private embeddingService = getGeminiEmbeddingService();
  private semanticDetector = new SemanticBoundaryDetector();

  /**
   * Main retrieval method that supports multiple strategies
   */
  async retrieveChunks(
    projectId: string,
    query: string,
    strategy: RetrievalStrategy = 'hybrid',
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const startTime = Date.now();

    let result: RetrievalResult;

    switch (strategy) {
      case 'semantic':
        result = await this.semanticRetrieval(projectId, query, options);
        break;
      case 'hierarchical':
        result = await this.hierarchicalRetrieval(projectId, query, options);
        break;
      case 'hybrid':
        result = await this.hybridRetrieval(projectId, query, options);
        break;
      case 'contextual':
        result = await this.contextualRetrieval(projectId, query, options);
        break;
      case 'keyword':
        result = await this.keywordRetrieval(projectId, query, options);
        break;
      default:
        throw new Error(`Unknown retrieval strategy: ${strategy}`);
    }

    result.processing_time_ms = Date.now() - startTime;
    result.query_strategy = strategy;

    return result;
  }

  /**
   * Semantic retrieval using vector similarity
   */
  private async semanticRetrieval(
    projectId: string,
    query: string,
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    // Generate query embedding
    const queryEmbedding = await this.generateQueryEmbedding(query);

    // Build ChromaDB query options
    const chromaOptions: QueryOptions = {
      n_results: options.max_results || 10,
      include: ['metadatas', 'documents', 'distances']
    };

    // Add filters
    if (options.filter_by_document) {
      chromaOptions.where = { document_id: options.filter_by_document };
    }

    if (options.filter_by_type) {
      chromaOptions.where = { ...chromaOptions.where, chunk_type: options.filter_by_type };
    }

    if (options.hierarchy_level !== undefined) {
      chromaOptions.where = { ...chromaOptions.where, hierarchy_level: options.hierarchy_level };
    }

    // Query ChromaDB
    const queryResult = await this.chromaService.queryBySemanticSimilarity(
      projectId,
      queryEmbedding,
      chromaOptions
    );

    // Filter by similarity threshold
    const filteredResults = this.filterBySimilarity(queryResult, options.similarity_threshold || 0.5);

    // Convert to enriched chunks
    const enrichedChunks = await this.enrichChunks(
      filteredResults,
      projectId,
      options
    );

    return {
      chunks: enrichedChunks,
      total_found: enrichedChunks.length,
      query_strategy: 'semantic',
      processing_time_ms: 0, // Will be set by caller
      aggregated_metadata: this.aggregateMetadata(enrichedChunks)
    };
  }

  /**
   * Hierarchical retrieval based on document structure
   */
  private async hierarchicalRetrieval(
    projectId: string,
    query: string,
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    const chunks: EnrichedChunk[] = [];

    // Parse query for hierarchical patterns
    const hierarchyHints = this.parseHierarchicalQuery(query);

    if (hierarchyHints.heading_path) {
      // Search by heading path
      const result = await this.chromaService.getChunksByHeadingPath(
        projectId,
        hierarchyHints.heading_path,
        { n_results: options.max_results || 50 }
      );
      chunks.push(...await this.chromaResultToEnrichedChunks(result, projectId));
    }

    if (hierarchyHints.level !== undefined) {
      // Search by hierarchy level
      const result = await this.chromaService.getChunksByHierarchyLevel(
        projectId,
        hierarchyHints.level,
        { n_results: options.max_results || 50 }
      );
      chunks.push(...await this.chromaResultToEnrichedChunks(result, projectId));
    }

    // Remove duplicates and sort by hierarchy position
    const uniqueChunks = this.removeDuplicateChunks(chunks);
    const sortedChunks = uniqueChunks.sort((a, b) => {
      if (a.hierarchy_level !== b.hierarchy_level) {
        return a.hierarchy_level - b.hierarchy_level;
      }
      return a.position - b.position;
    });

    return {
      chunks: sortedChunks.slice(0, options.max_results || 10),
      total_found: sortedChunks.length,
      query_strategy: 'hierarchical',
      processing_time_ms: 0,
      aggregated_metadata: this.aggregateMetadata(sortedChunks)
    };
  }

  /**
   * Hybrid retrieval combining semantic and hierarchical approaches
   */
  private async hybridRetrieval(
    projectId: string,
    query: string,
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    // Get semantic results
    const semanticResults = await this.semanticRetrieval(projectId, query, {
      ...options,
      max_results: Math.ceil((options.max_results || 10) * 0.7) // 70% semantic
    });

    // Get hierarchical results
    const hierarchicalResults = await this.hierarchicalRetrieval(projectId, query, {
      ...options,
      max_results: Math.ceil((options.max_results || 10) * 0.3) // 30% hierarchical
    });

    // Combine and deduplicate results
    const combinedChunks = [...semanticResults.chunks, ...hierarchicalResults.chunks];
    const uniqueChunks = this.removeDuplicateChunks(combinedChunks);

    // Rerank based on combined score
    const rerankedChunks = this.rerankHybridResults(uniqueChunks, query);

    return {
      chunks: rerankedChunks.slice(0, options.max_results || 10),
      total_found: uniqueChunks.length,
      query_strategy: 'hybrid',
      processing_time_ms: 0,
      aggregated_metadata: this.aggregateMetadata(rerankedChunks)
    };
  }

  /**
   * Contextual retrieval that includes surrounding chunks
   */
  private async contextualRetrieval(
    projectId: string,
    query: string,
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    // Start with semantic retrieval
    const baseResults = await this.semanticRetrieval(projectId, query, {
      ...options,
      include_context: false // Don't include context yet
    });

    // Expand each result with context
    const contextualChunks = await this.expandWithContext(
      baseResults.chunks,
      projectId,
      options.context_window || 2
    );

    return {
      chunks: contextualChunks,
      total_found: contextualChunks.length,
      query_strategy: 'contextual',
      processing_time_ms: 0,
      aggregated_metadata: this.aggregateMetadata(contextualChunks)
    };
  }

  /**
   * Keyword-based retrieval using database text search
   */
  private async keywordRetrieval(
    projectId: string,
    query: string,
    options: RetrievalOptions
  ): Promise<RetrievalResult> {
    const keywords = this.extractKeywords(query);
    const chunks: EnrichedChunk[] = [];

    try {
      // Search in chunk content
      const contentResults = await sql`
        SELECT dc.*, d.project_id
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.project_id = ${projectId}
        AND (
          dc.content ILIKE ${`%${keywords.join('%')}%`}
          OR dc.topic_keywords && ${keywords}
        )
        ORDER BY
          CASE WHEN dc.content ILIKE ${`%${query}%`} THEN 1 ELSE 2 END,
          dc.position
        LIMIT ${options.max_results || 20}
      `;

      for (const row of contentResults) {
        const chunk = this.dbRowToEnrichedChunk(row as any);
        chunks.push(chunk);
      }

      // Add context if requested
      if (options.include_context) {
        for (const chunk of chunks) {
          chunk.context_chunks = await this.getAdjacentChunks(
            chunk,
            options.context_window || 1
          );
        }
      }

    } catch (error) {
      console.error('Keyword retrieval failed:', error);
    }

    return {
      chunks,
      total_found: chunks.length,
      query_strategy: 'keyword',
      processing_time_ms: 0,
      aggregated_metadata: this.aggregateMetadata(chunks)
    };
  }

  /**
   * Browse chunks by document structure (like a table of contents)
   */
  async browseByStructure(
    projectId: string,
    options: {
      document_id?: string;
      max_depth?: number;
      include_content?: boolean;
    } = {}
  ): Promise<{
    structure: Array<{
      heading: EnrichedChunk;
      children: EnrichedChunk[];
      depth: number;
    }>;
    total_headings: number;
  }> {
    try {
      let whereClause = sql`d.project_id = ${projectId} AND dc.chunk_type = 'heading'`;

      if (options.document_id) {
        whereClause = sql`d.project_id = ${projectId} AND dc.document_id = ${options.document_id} AND dc.chunk_type = 'heading'`;
      }

      const headings = await sql`
        SELECT dc.*, d.project_id
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE ${whereClause}
        ORDER BY dc.hierarchy_level, dc.position
      `;

      const structure: Array<{
        heading: EnrichedChunk;
        children: EnrichedChunk[];
        depth: number;
      }> = [];

      for (const headingRow of headings) {
        const heading = this.dbRowToEnrichedChunk(headingRow as any);

        // Get children chunks under this heading
        const children = options.include_content ?
          await this.getChunksUnderHeading(heading) : [];

        structure.push({
          heading,
          children,
          depth: heading.hierarchy_level
        });
      }

      return {
        structure,
        total_headings: headings.length
      };

    } catch (error) {
      console.error('Browse by structure failed:', error);
      return { structure: [], total_headings: 0 };
    }
  }

  /**
   * Get related chunks based on similarity and hierarchy
   */
  async getRelatedChunks(
    chunkId: string,
    projectId: string,
    options: {
      max_results?: number;
      include_siblings?: boolean;
      include_parent_children?: boolean;
      similarity_threshold?: number;
    } = {}
  ): Promise<EnrichedChunk[]> {
    const relatedChunks: EnrichedChunk[] = [];

    try {
      // Get the source chunk
      const sourceChunk = await this.getChunkById(chunkId);
      if (!sourceChunk) return [];

      // Get sibling chunks (same hierarchy level)
      if (options.include_siblings) {
        const siblings = await this.getSiblingChunks(sourceChunk, projectId);
        relatedChunks.push(...siblings);
      }

      // Get parent and child chunks
      if (options.include_parent_children) {
        const parentChildren = await this.getParentAndChildChunks(sourceChunk, projectId);
        relatedChunks.push(...parentChildren);
      }

      // Get semantically similar chunks
      if (sourceChunk.content) {
        const queryEmbedding = await this.generateQueryEmbedding(sourceChunk.content);
        const semanticResults = await this.chromaService.queryBySemanticSimilarity(
          projectId,
          queryEmbedding,
          {
            n_results: options.max_results || 5,
            include: ['metadatas', 'documents', 'distances']
          }
        );

        const filteredResults = this.filterBySimilarity(
          semanticResults,
          options.similarity_threshold || 0.6
        );

        const semanticChunks = await this.chromaResultToEnrichedChunks(filteredResults, projectId);
        relatedChunks.push(...semanticChunks);
      }

      // Remove duplicates and the source chunk itself
      const uniqueChunks = this.removeDuplicateChunks(relatedChunks)
        .filter(chunk => chunk.id !== chunkId);

      return uniqueChunks.slice(0, options.max_results || 10);

    } catch (error) {
      console.error('Get related chunks failed:', error);
      return [];
    }
  }

  // Helper methods

  private async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      // Use real Gemini embedding service for query embeddings
      const embedding = await this.embeddingService.generateQueryEmbedding(query);
      return embedding;
    } catch (error) {
      console.error('Failed to generate query embedding with Gemini service:', error);
      console.warn('Falling back to mock embedding for query');

      // Fallback to simple hash-based embedding
      const embedding = new Array(AI_CONFIG.embeddings.dimensions).fill(0);
      for (let i = 0; i < query.length; i++) {
        const index = query.charCodeAt(i) % embedding.length;
        embedding[index] += 1 / query.length;
      }
      return embedding;
    }
  }

  private filterBySimilarity(queryResult: QueryResult, threshold: number): QueryResult {
    const filteredIndices: number[] = [];
    const filteredIds: string[] = [];
    const filteredDocuments: string[] = [];
    const filteredMetadatas: any[] = [];
    const filteredDistances: number[] = [];

    for (let i = 0; i < queryResult.distances.length; i++) {
      const similarity = 1 - queryResult.distances[i]; // Convert distance to similarity
      if (similarity >= threshold) {
        filteredIndices.push(i);
        filteredIds.push(queryResult.ids[i]);
        filteredDocuments.push(queryResult.documents[i]);
        filteredMetadatas.push(queryResult.metadatas[i]);
        filteredDistances.push(queryResult.distances[i]);
      }
    }

    return {
      ids: filteredIds,
      documents: filteredDocuments,
      metadatas: filteredMetadatas,
      distances: filteredDistances
    };
  }

  private async enrichChunks(
    queryResult: QueryResult,
    projectId: string,
    options: RetrievalOptions
  ): Promise<EnrichedChunk[]> {
    const enrichedChunks = await this.chromaResultToEnrichedChunks(queryResult, projectId);

    if (options.include_context) {
      for (const chunk of enrichedChunks) {
        chunk.context_chunks = await this.getAdjacentChunks(
          chunk,
          options.context_window || 1
        );
      }
    }

    return enrichedChunks;
  }

  private async chromaResultToEnrichedChunks(
    queryResult: QueryResult,
    projectId: string
  ): Promise<EnrichedChunk[]> {
    const enrichedChunks: EnrichedChunk[] = [];

    for (let i = 0; i < queryResult.ids.length; i++) {
      const metadata = queryResult.metadatas[i];
      const content = queryResult.documents[i];
      const similarity = queryResult.distances.length > i ?
        1 - queryResult.distances[i] : undefined;

      const enrichedChunk: EnrichedChunk = {
        id: queryResult.ids[i],
        document_id: metadata.document_id,
        content,
        tokens: metadata.tokens,
        position: metadata.position,
        heading_path: metadata.heading_path ? metadata.heading_path.split(' > ') : [],
        hierarchy_level: metadata.hierarchy_level,
        chunk_type: metadata.chunk_type as any,
        semantic_density: metadata.semantic_density,
        topic_keywords: metadata.topic_keywords ?
          metadata.topic_keywords.split(', ') : [],
        has_overlap_previous: false,
        has_overlap_next: false,
        sibling_chunk_ids: [],
        child_chunk_ids: [],
        similarity_score: similarity,
        metadata: {
          created_at: new Date(metadata.created_at),
          source_file_id: metadata.source_file_id,
          source_file_name: metadata.source_file_name,
          chunking_method: metadata.chunking_method
        }
      };

      enrichedChunks.push(enrichedChunk);
    }

    return enrichedChunks;
  }

  private parseHierarchicalQuery(query: string): {
    heading_path?: string;
    level?: number;
  } {
    const result: { heading_path?: string; level?: number } = {};

    // Look for level indicators
    const levelMatch = query.match(/level\s*(\d+)|h(\d+)|heading\s*(\d+)/i);
    if (levelMatch) {
      result.level = parseInt(levelMatch[1] || levelMatch[2] || levelMatch[3]);
    }

    // Look for heading path
    const headingMatch = query.match(/(?:section|heading|chapter)\s*[":]*\s*([^,\.]+)/i);
    if (headingMatch) {
      result.heading_path = headingMatch[1].trim();
    }

    return result;
  }

  private removeDuplicateChunks(chunks: EnrichedChunk[]): EnrichedChunk[] {
    const seen = new Set<string>();
    return chunks.filter(chunk => {
      if (seen.has(chunk.id)) {
        return false;
      }
      seen.add(chunk.id);
      return true;
    });
  }

  private rerankHybridResults(chunks: EnrichedChunk[], query: string): EnrichedChunk[] {
    // Simple reranking based on combined semantic and structural factors
    return chunks.sort((a, b) => {
      const aScore = (a.similarity_score || 0) * 0.7 +
                    (a.hierarchy_level === 1 ? 0.3 : 0) +
                    (a.chunk_type === 'heading' ? 0.2 : 0);
      const bScore = (b.similarity_score || 0) * 0.7 +
                    (b.hierarchy_level === 1 ? 0.3 : 0) +
                    (b.chunk_type === 'heading' ? 0.2 : 0);
      return bScore - aScore;
    });
  }

  private async expandWithContext(
    chunks: EnrichedChunk[],
    projectId: string,
    contextWindow: number
  ): Promise<EnrichedChunk[]> {
    for (const chunk of chunks) {
      chunk.context_chunks = await this.getAdjacentChunks(chunk, contextWindow);
    }
    return chunks;
  }

  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  private aggregateMetadata(chunks: EnrichedChunk[]): {
    documents_covered: string[];
    heading_paths_covered: string[];
    hierarchy_levels: number[];
    average_similarity?: number;
  } {
    const documentIds = new Set(chunks.map(c => c.document_id));
    const headingPaths = new Set(chunks.map(c => c.heading_path.join(' > ')));
    const hierarchyLevels = [...new Set(chunks.map(c => c.hierarchy_level))];

    const similarities = chunks
      .map(c => c.similarity_score)
      .filter((s): s is number => s !== undefined);

    const averageSimilarity = similarities.length > 0 ?
      similarities.reduce((sum, s) => sum + s, 0) / similarities.length : undefined;

    return {
      documents_covered: Array.from(documentIds),
      heading_paths_covered: Array.from(headingPaths),
      hierarchy_levels: hierarchyLevels.sort((a, b) => a - b),
      average_similarity: averageSimilarity
    };
  }

  // Database helper methods

  private async getChunkById(chunkId: string): Promise<EnrichedChunk | null> {
    try {
      const result = await sql`
        SELECT * FROM document_chunks WHERE id = ${chunkId}
      `;
      if (result.length === 0) return null;
      return this.dbRowToEnrichedChunk(result[0] as any);
    } catch (error) {
      console.error('Failed to get chunk by ID:', error);
      return null;
    }
  }

  private async getAdjacentChunks(
    chunk: EnrichedChunk,
    window: number
  ): Promise<EnrichedChunk[]> {
    try {
      const result = await sql`
        SELECT * FROM document_chunks
        WHERE document_id = ${chunk.document_id}
        AND position BETWEEN ${chunk.position - window} AND ${chunk.position + window}
        AND id != ${chunk.id}
        ORDER BY position
      `;
      return result.map(row => this.dbRowToEnrichedChunk(row as any));
    } catch (error) {
      console.error('Failed to get adjacent chunks:', error);
      return [];
    }
  }

  private async getSiblingChunks(
    chunk: EnrichedChunk,
    projectId: string
  ): Promise<EnrichedChunk[]> {
    try {
      const result = await sql`
        SELECT dc.* FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.project_id = ${projectId}
        AND dc.hierarchy_level = ${chunk.hierarchy_level}
        AND dc.id != ${chunk.id}
        ORDER BY dc.position
        LIMIT 5
      `;
      return result.map(row => this.dbRowToEnrichedChunk(row as any));
    } catch (error) {
      console.error('Failed to get sibling chunks:', error);
      return [];
    }
  }

  private async getParentAndChildChunks(
    chunk: EnrichedChunk,
    projectId: string
  ): Promise<EnrichedChunk[]> {
    try {
      const result = await sql`
        SELECT dc.* FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.project_id = ${projectId}
        AND (
          dc.hierarchy_level = ${chunk.hierarchy_level - 1}
          OR dc.hierarchy_level = ${chunk.hierarchy_level + 1}
        )
        AND dc.id != ${chunk.id}
        ORDER BY dc.hierarchy_level, dc.position
        LIMIT 10
      `;
      return result.map(row => this.dbRowToEnrichedChunk(row as any));
    } catch (error) {
      console.error('Failed to get parent/child chunks:', error);
      return [];
    }
  }

  private async getChunksUnderHeading(heading: EnrichedChunk): Promise<EnrichedChunk[]> {
    try {
      const result = await sql`
        SELECT * FROM document_chunks
        WHERE document_id = ${heading.document_id}
        AND position > ${heading.position}
        AND hierarchy_level > ${heading.hierarchy_level}
        ORDER BY position
        LIMIT 20
      `;
      return result.map(row => this.dbRowToEnrichedChunk(row as any));
    } catch (error) {
      console.error('Failed to get chunks under heading:', error);
      return [];
    }
  }

  private dbRowToEnrichedChunk(row: any): EnrichedChunk {
    return {
      id: row.id,
      document_id: row.document_id,
      content: row.content,
      tokens: row.tokens,
      position: row.position,
      heading_path: row.heading_path || [],
      hierarchy_level: row.hierarchy_level || 0,
      parent_section_id: row.parent_section_id,
      chunk_type: row.chunk_type || 'paragraph',
      semantic_density: row.semantic_density || 0,
      topic_keywords: row.topic_keywords || [],
      has_overlap_previous: row.has_overlap_previous || false,
      has_overlap_next: row.has_overlap_next || false,
      overlap_text: row.overlap_text,
      previous_chunk_id: row.previous_chunk_id,
      next_chunk_id: row.next_chunk_id,
      sibling_chunk_ids: row.sibling_chunk_ids || [],
      child_chunk_ids: row.child_chunk_ids || [],
      metadata: {
        created_at: new Date(row.created_at),
        source_file_id: row.source_file_id || '',
        source_file_name: row.source_file_name || '',
        chunking_method: row.chunking_method || 'hybrid'
      }
    };
  }
}

// Singleton instance
let retrieverInstance: ChunkRetriever | null = null;

export function getChunkRetriever(): ChunkRetriever {
  if (!retrieverInstance) {
    retrieverInstance = new ChunkRetriever();
  }
  return retrieverInstance;
}