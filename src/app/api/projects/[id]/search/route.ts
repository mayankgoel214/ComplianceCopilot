import { NextRequest, NextResponse } from 'next/server';
import { getChunkRetriever, RetrievalStrategy } from '@/lib/retrieval/chunk-retriever';

// Helper function to verify Firebase token
async function verifyToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  const admin = await import('firebase-admin');

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// POST /api/projects/[id]/search - Semantic search within project chunks
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify Firebase ID token for user authentication
    await verifyToken(request.headers.get('authorization'));

    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const {
      query,
      strategy = 'hybrid',
      max_results = 10,
      similarity_threshold = 0.5,
      include_context = false,
      context_window = 1,
      filters = {}
    } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required and must be a string' },
        { status: 400 }
      );
    }

    if (query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query cannot be empty' },
        { status: 400 }
      );
    }

    // Validate strategy
    const validStrategies: RetrievalStrategy[] = ['semantic', 'hierarchical', 'hybrid', 'contextual', 'keyword'];
    if (!validStrategies.includes(strategy as RetrievalStrategy)) {
      return NextResponse.json(
        { error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}` },
        { status: 400 }
      );
    }

    // Build retrieval options
    const options = {
      max_results: Math.min(Math.max(1, max_results), 100), // Clamp between 1 and 100
      similarity_threshold: Math.max(0, Math.min(1, similarity_threshold)), // Clamp between 0 and 1
      include_context,
      context_window: Math.max(0, Math.min(5, context_window)), // Clamp between 0 and 5
      filter_by_document: filters.document_id,
      filter_by_heading: filters.heading_path,
      filter_by_type: filters.chunk_type,
      hierarchy_level: filters.hierarchy_level,
      boost_recent: filters.boost_recent
    };

    const retriever = getChunkRetriever();

    // Perform the search
    const result = await retriever.retrieveChunks(
      projectId,
      query,
      strategy as RetrievalStrategy,
      options
    );

    // Transform results for API response
    const responseChunks = result.chunks.map(chunk => ({
      id: chunk.id,
      document_id: chunk.document_id,
      content: chunk.content,
      position: chunk.position,
      tokens: chunk.tokens,
      heading_path: chunk.heading_path,
      hierarchy_level: chunk.hierarchy_level,
      chunk_type: chunk.chunk_type,
      semantic_density: chunk.semantic_density,
      topic_keywords: chunk.topic_keywords,
      similarity_score: chunk.similarity_score,
      source_file_name: chunk.metadata.source_file_name,
      created_at: chunk.metadata.created_at,

      // Include context if requested
      context_chunks: chunk.context_chunks?.map(ctx => ({
        id: ctx.id,
        content: ctx.content,
        position: ctx.position,
        chunk_type: ctx.chunk_type,
        hierarchy_level: ctx.hierarchy_level
      })),

      // Include related chunks if available
      related_chunks: chunk.related_chunks?.map(rel => ({
        id: rel.id,
        content: rel.content.substring(0, 200) + (rel.content.length > 200 ? '...' : ''),
        similarity_score: rel.similarity_score,
        chunk_type: rel.chunk_type
      }))
    }));

    return NextResponse.json({
      success: true,
      query: {
        text: query,
        strategy,
        options: options
      },
      results: {
        chunks: responseChunks,
        total_found: result.total_found,
        processing_time_ms: result.processing_time_ms,
        aggregated_metadata: result.aggregated_metadata
      },
      search_metadata: {
        strategy_used: result.query_strategy,
        filters_applied: {
          document_id: filters.document_id || null,
          heading_path: filters.heading_path || null,
          chunk_type: filters.chunk_type || null,
          hierarchy_level: filters.hierarchy_level || null
        },
        similarity_range: responseChunks.length > 0 ? {
          min: Math.min(...responseChunks.map(c => c.similarity_score || 0)),
          max: Math.max(...responseChunks.map(c => c.similarity_score || 0)),
          average: result.aggregated_metadata.average_similarity
        } : null
      }
    });

  } catch (error) {
    console.error('Error in POST /api/projects/[id]/search:', error);

    if (error instanceof Error) {
      if (error.message.includes('token') || error.message.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please sign out and sign in again.' },
          { status: 401 }
        );
      }

      if (error.message.includes('strategy')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Search failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET /api/projects/[id]/search - Get related chunks for a specific chunk
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify Firebase ID token for user authentication
    await verifyToken(request.headers.get('authorization'));

    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const chunkId = url.searchParams.get('chunk_id');
    const maxResults = parseInt(url.searchParams.get('max_results') || '5');
    const includeSiblings = url.searchParams.get('include_siblings') === 'true';
    const includeParentChildren = url.searchParams.get('include_parent_children') === 'true';
    const similarityThreshold = parseFloat(url.searchParams.get('similarity_threshold') || '0.6');

    if (!chunkId) {
      return NextResponse.json(
        { error: 'chunk_id parameter is required' },
        { status: 400 }
      );
    }

    const retriever = getChunkRetriever();

    // Get related chunks
    const relatedChunks = await retriever.getRelatedChunks(
      chunkId,
      projectId,
      {
        max_results: Math.min(Math.max(1, maxResults), 20),
        include_siblings: includeSiblings,
        include_parent_children: includeParentChildren,
        similarity_threshold: Math.max(0, Math.min(1, similarityThreshold))
      }
    );

    // Transform results for API response
    const responseChunks = relatedChunks.map(chunk => ({
      id: chunk.id,
      document_id: chunk.document_id,
      content: chunk.content.substring(0, 300) + (chunk.content.length > 300 ? '...' : ''),
      position: chunk.position,
      tokens: chunk.tokens,
      heading_path: chunk.heading_path,
      hierarchy_level: chunk.hierarchy_level,
      chunk_type: chunk.chunk_type,
      semantic_density: chunk.semantic_density,
      similarity_score: chunk.similarity_score,
      source_file_name: chunk.metadata.source_file_name
    }));

    return NextResponse.json({
      success: true,
      source_chunk_id: chunkId,
      related_chunks: responseChunks,
      total_found: relatedChunks.length,
      relationship_types: {
        siblings_included: includeSiblings,
        parent_children_included: includeParentChildren,
        semantic_similarity: true
      }
    });

  } catch (error) {
    console.error('Error in GET /api/projects/[id]/search:', error);

    if (error instanceof Error) {
      if (error.message.includes('token') || error.message.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please sign out and sign in again.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      {
        error: 'Failed to get related chunks',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}