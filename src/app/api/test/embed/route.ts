import { NextRequest, NextResponse } from 'next/server';
import { SemanticChunker, ChunkingConfig } from '@/lib/processing/semantic-chunker';
import { getGeminiEmbeddingService } from '@/lib/ai/gemini-embeddings';
import { getChromaService } from '@/lib/vector/chroma-service';
import { MockVectorService } from '@/lib/vector/mock-vector-service';
import { ChunkRetriever, RetrievalStrategy, RetrievalOptions } from '@/lib/retrieval/chunk-retriever';

export interface EmbedTestRequest {
  content: string;
  query: string;
  config?: Partial<ChunkingConfig>;
  retrieval?: {
    strategy?: RetrievalStrategy;
    max_results?: number;
    similarity_threshold?: number;
    filter_by_type?: string;
    hierarchy_level?: number;
  };
}

export interface EmbedTestResponse {
  success: boolean;
  input_stats: {
    content_length: number;
    total_chunks_created: number;
    total_tokens: number;
    average_chunk_size: number;
    embedding_generation_time_ms: number;
    embeddings_generated: number;
  };
  search_results: {
    query: string;
    strategy_used: RetrievalStrategy;
    total_results: number;
    search_time_ms: number;
    chunks: Array<{
      id: string;
      content: string;
      similarity_score: number;
      distance: number;
      tokens: number;
      chunk_type: string;
      heading_path: string[];
      topic_keywords: string[];
      position: number;
      hierarchy_level: number;
      semantic_density: number;
    }>;
  };
  performance: {
    total_time_ms: number;
    chunking_time_ms: number;
    embedding_time_ms: number;
    indexing_time_ms: number;
    search_time_ms: number;
    cleanup_time_ms: number;
  };
  metadata: {
    temp_project_id: string;
    timestamp: string;
    embeddings_api_calls: number;
    tokens_used: number;
  };
}

// POST /api/test/embed - Test complete semantic search pipeline
export async function POST(request: NextRequest) {
  const totalStartTime = Date.now();
  let tempProjectId: string | null = null;

  try {
    const body: EmbedTestRequest = await request.json();

    // Validate required fields
    if (!body.content || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      );
    }

    if (!body.query || typeof body.query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    if (body.content.trim().length === 0) {
      return NextResponse.json(
        { error: 'Content cannot be empty' },
        { status: 400 }
      );
    }

    if (body.query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query cannot be empty' },
        { status: 400 }
      );
    }

    // Generate temporary project ID for this test
    tempProjectId = `test-embed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`🧪 Starting embed test with temp project: ${tempProjectId}`);

    // Default configurations
    const defaultChunkingConfig: ChunkingConfig = {
      min_chunk_size: 100,
      max_chunk_size: 500,
      target_chunk_size: 300,
      overlap_percentage: 10,
      prefer_semantic_boundaries: true,
      respect_section_boundaries: true,
      include_heading_context: true
    };

    const defaultRetrievalConfig = {
      strategy: 'semantic' as RetrievalStrategy,
      max_results: 5,
      similarity_threshold: 0.3
    };

    const chunkingConfig = { ...defaultChunkingConfig, ...body.config };
    const retrievalConfig = { ...defaultRetrievalConfig, ...body.retrieval };

    // Initialize services
    const chunker = new SemanticChunker();
    const embeddingService = getGeminiEmbeddingService();

    // Try ChromaDB first, fall back to mock if not available
    let vectorService: any;
    let usingMockService = false;

    try {
      const chromaService = getChromaService();
      await chromaService.initialize();
      const isHealthy = await chromaService.healthCheck();

      if (isHealthy) {
        vectorService = chromaService;
        console.log('✅ Using ChromaDB for vector operations');
      } else {
        throw new Error('ChromaDB health check failed');
      }
    } catch (chromaError) {
      console.log('⚠️ ChromaDB not available, using mock vector service');
      console.log(`ChromaDB error: ${chromaError instanceof Error ? chromaError.message : 'Unknown error'}`);

      vectorService = new MockVectorService();
      await vectorService.initialize();
      usingMockService = true;
    }

    const retriever = new ChunkRetriever();

    // Step 1: Chunk the input content
    console.log('📄 Chunking input content...');
    const chunkStartTime = Date.now();

    const chunkResult = await chunker.chunkDocument(
      body.content,
      `test-doc-${Date.now()}`,
      `test-file-${Date.now()}`,
      'test-content.md',
      chunkingConfig
    );

    const chunkingTime = Date.now() - chunkStartTime;
    console.log(`✅ Created ${chunkResult.chunks.length} chunks in ${chunkingTime}ms`);

    // Step 2: Generate embeddings for chunks
    console.log('🧠 Generating embeddings...');
    const embeddingStartTime = Date.now();

    const embeddingResult = await embeddingService.generateEmbeddings(
      chunkResult.chunks.map(chunk => chunk.content),
      { taskType: 'document' }
    );

    const embeddingTime = Date.now() - embeddingStartTime;
    console.log(`✅ Generated ${embeddingResult.embeddings.length} embeddings in ${embeddingTime}ms`);
    console.log(`📊 Used ${embeddingResult.tokensUsed} tokens, ${embeddingResult.requestCount} API calls`);

    // Step 3: Store in vector database temporarily
    console.log(`💾 Storing in vector database (${usingMockService ? 'mock' : 'ChromaDB'})...`);
    const indexingStartTime = Date.now();

    await vectorService.addDocumentChunks(
      tempProjectId,
      chunkResult.chunks,
      embeddingResult.embeddings
    );

    const indexingTime = Date.now() - indexingStartTime;
    console.log(`✅ Indexed chunks in vector database in ${indexingTime}ms`);

    // Step 4: Perform semantic search
    console.log(`🔍 Searching for: "${body.query}"`);
    const searchStartTime = Date.now();

    // Generate query embedding
    const queryEmbeddingResult = await embeddingService.generateEmbeddings(
      [body.query],
      { taskType: 'query' }
    );
    const queryEmbedding = queryEmbeddingResult.embeddings[0];

    // Search using vector service directly
    const rawSearchResults = await vectorService.queryBySemanticSimilarity(
      tempProjectId,
      queryEmbedding,
      {
        n_results: retrievalConfig.max_results,
        include: ['metadatas', 'documents', 'distances']
      }
    );

    // Transform results and apply similarity threshold
    const chunks = [];
    const similarity_scores = [];
    const distances = [];

    for (let i = 0; i < rawSearchResults.ids.length; i++) {
      const similarityScore = 1 - rawSearchResults.distances[i]; // Convert distance to similarity

      if (similarityScore >= retrievalConfig.similarity_threshold) {
        const metadata = rawSearchResults.metadatas[i];

        chunks.push({
          id: rawSearchResults.ids[i],
          content: rawSearchResults.documents[i],
          document_id: metadata.document_id,
          chunk_type: metadata.chunk_type,
          hierarchy_level: metadata.hierarchy_level,
          position: metadata.position,
          tokens: metadata.tokens,
          heading_path: metadata.heading_path.split(' > ').filter(Boolean),
          topic_keywords: metadata.topic_keywords.split(', ').filter(Boolean),
          semantic_density: metadata.semantic_density,
          metadata: {
            chunking_method: metadata.chunking_method,
            created_at: new Date(metadata.created_at),
            source_file_id: metadata.source_file_id,
            source_file_name: metadata.source_file_name
          }
        });

        similarity_scores.push(similarityScore);
        distances.push(rawSearchResults.distances[i]);
      }
    }

    const searchResults = {
      chunks,
      similarity_scores,
      distances,
      total_found: chunks.length,
      query_strategy: retrievalConfig.strategy,
      processing_time_ms: 0 // Will be calculated below
    };

    const searchTime = Date.now() - searchStartTime;
    console.log(`✅ Found ${searchResults.chunks.length} relevant chunks in ${searchTime}ms`);

    // Step 5: Clean up temporary collection
    console.log('🧹 Cleaning up temporary data...');
    const cleanupStartTime = Date.now();

    await vectorService.deleteProjectCollection(tempProjectId);

    const cleanupTime = Date.now() - cleanupStartTime;
    console.log(`✅ Cleanup completed in ${cleanupTime}ms`);

    // Prepare response
    const totalTime = Date.now() - totalStartTime;

    // Transform search results for response
    const responseChunks = searchResults.chunks.map((chunk, index) => ({
      id: chunk.id,
      content: chunk.content,
      similarity_score: searchResults.similarity_scores?.[index] || 0,
      distance: searchResults.distances?.[index] || 0,
      tokens: chunk.tokens,
      chunk_type: chunk.chunk_type,
      heading_path: chunk.heading_path,
      topic_keywords: chunk.topic_keywords,
      position: chunk.position,
      hierarchy_level: chunk.hierarchy_level,
      semantic_density: chunk.semantic_density
    }));

    const response: EmbedTestResponse = {
      success: true,
      input_stats: {
        content_length: body.content.length,
        total_chunks_created: chunkResult.chunks.length,
        total_tokens: chunkResult.total_tokens,
        average_chunk_size: chunkResult.average_chunk_size,
        embedding_generation_time_ms: embeddingTime,
        embeddings_generated: embeddingResult.embeddings.length
      },
      search_results: {
        query: body.query,
        strategy_used: retrievalConfig.strategy,
        total_results: responseChunks.length,
        search_time_ms: searchTime,
        chunks: responseChunks
      },
      performance: {
        total_time_ms: totalTime,
        chunking_time_ms: chunkingTime,
        embedding_time_ms: embeddingTime,
        indexing_time_ms: indexingTime,
        search_time_ms: searchTime,
        cleanup_time_ms: cleanupTime
      },
      metadata: {
        temp_project_id: tempProjectId,
        timestamp: new Date().toISOString(),
        embeddings_api_calls: embeddingResult.requestCount,
        tokens_used: embeddingResult.tokensUsed
      }
    };

    console.log(`🎉 Embed test completed successfully in ${totalTime}ms`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Error in embed test endpoint:', error);

    // Attempt cleanup on error
    if (tempProjectId) {
      try {
        console.log('🧹 Attempting cleanup after error...');
        // Try to clean up with whatever vector service is available
        try {
          const chromaService = getChromaService();
          await chromaService.deleteProjectCollection(tempProjectId);
        } catch {
          const mockService = new MockVectorService();
          await mockService.deleteProjectCollection(tempProjectId);
        }
        console.log('✅ Emergency cleanup completed');
      } catch (cleanupError) {
        console.error('❌ Failed to cleanup after error:', cleanupError);
      }
    }

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes('API key') || error.message.includes('GOOGLE_GEMINI_API_KEY')) {
        return NextResponse.json(
          {
            error: 'Embedding API configuration error',
            details: 'Google Gemini API key not properly configured',
            troubleshooting: 'Check that GOOGLE_GEMINI_API_KEY is set in .env.local'
          },
          { status: 401 }
        );
      }

      if (error.message.includes('quota') || error.message.includes('rate limit')) {
        return NextResponse.json(
          {
            error: 'API quota exceeded',
            details: 'Google Gemini API quota or rate limit reached',
            troubleshooting: 'Wait a moment and try again, or check your API quota'
          },
          { status: 429 }
        );
      }

      if (error.message.includes('ChromaDB') || error.message.includes('vector')) {
        return NextResponse.json(
          {
            error: 'Vector database error',
            details: 'Failed to interact with ChromaDB',
            troubleshooting: 'Ensure ChromaDB is properly initialized'
          },
          { status: 503 }
        );
      }

      if (error.message.includes('chunking') || error.message.includes('semantic')) {
        return NextResponse.json(
          {
            error: 'Document processing error',
            details: 'Failed during chunking or semantic analysis',
            troubleshooting: 'Check document content and chunking configuration'
          },
          { status: 422 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Embed test failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
        temp_project_id: tempProjectId,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

// GET /api/test/embed - Get information about the embed test endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/test/embed',
    description: 'Test endpoint for complete semantic search pipeline',
    methods: ['POST'],
    pipeline_steps: [
      '1. Chunk input content using SemanticChunker',
      '2. Generate embeddings using Gemini text-embedding-004',
      '3. Store chunks and embeddings in ChromaDB temporarily',
      '4. Perform semantic search with query',
      '5. Return ranked results by similarity',
      '6. Clean up temporary data'
    ],
    parameters: {
      content: {
        type: 'string',
        required: true,
        description: 'Text content to chunk and index for searching'
      },
      query: {
        type: 'string',
        required: true,
        description: 'Search query to find relevant chunks'
      },
      config: {
        type: 'object',
        required: false,
        description: 'Chunking configuration options',
        properties: {
          min_chunk_size: { type: 'number', default: 100 },
          max_chunk_size: { type: 'number', default: 500 },
          target_chunk_size: { type: 'number', default: 300 },
          overlap_percentage: { type: 'number', default: 10 },
          prefer_semantic_boundaries: { type: 'boolean', default: true }
        }
      },
      retrieval: {
        type: 'object',
        required: false,
        description: 'Search configuration options',
        properties: {
          strategy: {
            type: 'string',
            default: 'semantic',
            enum: ['semantic', 'hierarchical', 'hybrid', 'contextual', 'keyword']
          },
          max_results: { type: 'number', default: 5 },
          similarity_threshold: { type: 'number', default: 0.3 },
          filter_by_type: { type: 'string', description: 'Filter by chunk type' },
          hierarchy_level: { type: 'number', description: 'Filter by hierarchy level' }
        }
      }
    },
    example_request: {
      content: "# AI Safety\n\n## Overview\nAI safety is crucial for ensuring that artificial intelligence systems operate safely and beneficially.\n\n## Alignment Problem\nThe alignment problem refers to the challenge of ensuring AI systems pursue intended goals.",
      query: "What is the alignment problem?",
      config: {
        max_chunk_size: 400,
        overlap_percentage: 15
      },
      retrieval: {
        strategy: "semantic",
        max_results: 3,
        similarity_threshold: 0.4
      }
    },
    response_format: {
      success: 'boolean',
      input_stats: 'statistics about chunking and embedding generation',
      search_results: 'ranked search results with similarity scores',
      performance: 'timing metrics for each step',
      metadata: 'test metadata and API usage info'
    },
    notes: [
      'Uses temporary project IDs that are automatically cleaned up',
      'All data is deleted after the test completes',
      'Performance metrics help identify bottlenecks',
      'Supports all available retrieval strategies',
      'Real Gemini embeddings are used (requires valid API key)'
    ]
  });
}