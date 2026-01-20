import { NextRequest, NextResponse } from 'next/server';
import { getChunkRetriever } from '@/lib/retrieval/chunk-retriever';
import { sql } from '@/lib/db/neon-client';

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

// GET /api/projects/[id]/chunks - Retrieve chunks from a project
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

    // Parse query parameters
    const documentId = url.searchParams.get('document_id');
    const chunkType = url.searchParams.get('chunk_type');
    const hierarchyLevel = url.searchParams.get('hierarchy_level');
    const headingPath = url.searchParams.get('heading_path');
    const includeContent = url.searchParams.get('include_content') !== 'false';
    const includeContext = url.searchParams.get('include_context') === 'true';
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const sortBy = url.searchParams.get('sort_by') || 'position'; // position, created_at, tokens, hierarchy_level
    const sortOrder = url.searchParams.get('sort_order') || 'asc'; // asc, desc

    const retriever = getChunkRetriever();

    // Build WHERE conditions
    const conditions = [`d.project_id = ${projectId}`];
    const params: any[] = [];

    if (documentId) {
      conditions.push(`dc.document_id = $${conditions.length}`);
      params.push(documentId);
    }

    if (chunkType) {
      conditions.push(`dc.chunk_type = $${conditions.length}`);
      params.push(chunkType);
    }

    if (hierarchyLevel !== null) {
      const level = parseInt(hierarchyLevel);
      if (!isNaN(level)) {
        conditions.push(`dc.hierarchy_level = $${conditions.length}`);
        params.push(level);
      }
    }

    if (headingPath) {
      conditions.push(`$${conditions.length} = ANY(dc.heading_path)`);
      params.push(headingPath);
    }

    // Build ORDER BY clause
    const validSortFields = ['position', 'created_at', 'tokens', 'hierarchy_level', 'semantic_density'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'position';
    const order = sortOrder.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    // Get chunks with pagination
    const chunks = await sql`
      SELECT
        dc.*,
        d.file_name,
        d.drive_file_id,
        d.mime_type
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_id = ${projectId}
      ${documentId ? sql`AND dc.document_id = ${documentId}` : sql``}
      ${chunkType ? sql`AND dc.chunk_type = ${chunkType}` : sql``}
      ${hierarchyLevel !== null && !isNaN(parseInt(hierarchyLevel)) ? sql`AND dc.hierarchy_level = ${parseInt(hierarchyLevel)}` : sql``}
      ${headingPath ? sql`AND ${headingPath} = ANY(dc.heading_path)` : sql``}
      ORDER BY dc.${sql.unsafe(sortField)} ${sql.unsafe(order)}
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count for pagination
    const countResult = await sql`
      SELECT COUNT(*) as total
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_id = ${projectId}
      ${documentId ? sql`AND dc.document_id = ${documentId}` : sql``}
      ${chunkType ? sql`AND dc.chunk_type = ${chunkType}` : sql``}
      ${hierarchyLevel !== null && !isNaN(parseInt(hierarchyLevel)) ? sql`AND dc.hierarchy_level = ${parseInt(hierarchyLevel)}` : sql``}
      ${headingPath ? sql`AND ${headingPath} = ANY(dc.heading_path)` : sql``}
    `;

    const totalChunks = parseInt((countResult[0] as any).total);

    // Transform chunks to response format
    const responseChunks = await Promise.all(
      chunks.map(async (chunk: any) => {
        const chunkData: any = {
          id: chunk.id,
          document_id: chunk.document_id,
          document_name: chunk.file_name,
          position: chunk.position,
          tokens: chunk.tokens,
          heading_path: chunk.heading_path || [],
          hierarchy_level: chunk.hierarchy_level || 0,
          chunk_type: chunk.chunk_type,
          semantic_density: chunk.semantic_density || 0,
          topic_keywords: chunk.topic_keywords || [],
          has_overlap_previous: chunk.has_overlap_previous || false,
          has_overlap_next: chunk.has_overlap_next || false,
          chunking_method: chunk.chunking_method,
          created_at: chunk.created_at
        };

        // Include content if requested
        if (includeContent) {
          chunkData.content = chunk.content;
          chunkData.overlap_text = chunk.overlap_text;
        }

        // Include context chunks if requested
        if (includeContext) {
          try {
            const contextChunks = await sql`
              SELECT id, content, position, chunk_type, hierarchy_level
              FROM document_chunks
              WHERE document_id = ${chunk.document_id}
              AND position BETWEEN ${chunk.position - 2} AND ${chunk.position + 2}
              AND id != ${chunk.id}
              ORDER BY position
            `;

            chunkData.context_chunks = contextChunks.map((ctx: any) => ({
              id: ctx.id,
              content: includeContent ? ctx.content : undefined,
              position: ctx.position,
              chunk_type: ctx.chunk_type,
              hierarchy_level: ctx.hierarchy_level,
              relative_position: ctx.position - chunk.position
            }));
          } catch (error) {
            console.error('Failed to get context chunks:', error);
            chunkData.context_chunks = [];
          }
        }

        return chunkData;
      })
    );

    // Get aggregated statistics
    const statsResult = await sql`
      SELECT
        COUNT(*) as total_chunks,
        SUM(dc.tokens) as total_tokens,
        AVG(dc.tokens) as avg_tokens_per_chunk,
        AVG(dc.semantic_density) as avg_semantic_density,
        COUNT(DISTINCT dc.document_id) as documents_covered,
        COUNT(DISTINCT dc.chunk_type) as chunk_types_count,
        MAX(dc.hierarchy_level) as max_hierarchy_depth
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_id = ${projectId}
      ${documentId ? sql`AND dc.document_id = ${documentId}` : sql``}
      ${chunkType ? sql`AND dc.chunk_type = ${chunkType}` : sql``}
      ${hierarchyLevel !== null && !isNaN(parseInt(hierarchyLevel)) ? sql`AND dc.hierarchy_level = ${parseInt(hierarchyLevel)}` : sql``}
      ${headingPath ? sql`AND ${headingPath} = ANY(dc.heading_path)` : sql``}
    `;

    const stats = statsResult[0] as any;

    // Get chunk type distribution
    const typeDistribution = await sql`
      SELECT
        dc.chunk_type,
        COUNT(*) as count,
        SUM(dc.tokens) as total_tokens
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_id = ${projectId}
      ${documentId ? sql`AND dc.document_id = ${documentId}` : sql``}
      GROUP BY dc.chunk_type
      ORDER BY count DESC
    `;

    return NextResponse.json({
      chunks: responseChunks,
      pagination: {
        total: totalChunks,
        limit,
        offset,
        has_more: offset + limit < totalChunks,
        next_offset: offset + limit < totalChunks ? offset + limit : null
      },
      filters_applied: {
        document_id: documentId,
        chunk_type: chunkType,
        hierarchy_level: hierarchyLevel ? parseInt(hierarchyLevel) : null,
        heading_path: headingPath
      },
      statistics: {
        total_chunks: parseInt(stats.total_chunks) || 0,
        total_tokens: parseInt(stats.total_tokens) || 0,
        average_tokens_per_chunk: Math.round(parseFloat(stats.avg_tokens_per_chunk) || 0),
        average_semantic_density: parseFloat(stats.avg_semantic_density) || 0,
        documents_covered: parseInt(stats.documents_covered) || 0,
        chunk_types_count: parseInt(stats.chunk_types_count) || 0,
        max_hierarchy_depth: parseInt(stats.max_hierarchy_depth) || 0
      },
      chunk_type_distribution: typeDistribution.map((type: any) => ({
        chunk_type: type.chunk_type,
        count: parseInt(type.count),
        total_tokens: parseInt(type.total_tokens),
        percentage: Math.round((parseInt(type.count) / parseInt(stats.total_chunks)) * 100)
      }))
    });

  } catch (error) {
    console.error('Error in GET /api/projects/[id]/chunks:', error);

    if (error instanceof Error) {
      if (error.message.includes('token') || error.message.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please sign out and sign in again.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to retrieve chunks', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/chunks - Clear chunks and optionally reprocess
export async function DELETE(
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

    const body = await request.json().catch(() => ({}));
    const {
      document_id,
      confirm = false
    } = body;

    if (!confirm) {
      return NextResponse.json(
        { error: 'Deletion must be confirmed by setting confirm: true' },
        { status: 400 }
      );
    }

    // Import ChromaDB service
    const { getChromaService } = await import('@/lib/vector/chroma-service');
    const chromaService = getChromaService();

    if (document_id) {
      // Delete chunks for specific document
      await chromaService.deleteChunksByDocument(projectId, document_id);

      await sql`
        DELETE FROM document_chunks
        WHERE document_id = ${document_id}
      `;

      // Reset document processing status
      await sql`
        UPDATE documents
        SET last_analyzed = NULL
        WHERE id = ${document_id}
      `;

      return NextResponse.json({
        success: true,
        message: 'Document chunks deleted successfully',
        document_id
      });
    } else {
      // Delete all chunks for the project
      await chromaService.deleteProjectCollection(projectId);

      await sql`
        DELETE FROM document_chunks
        WHERE document_id IN (
          SELECT id FROM documents WHERE project_id = ${projectId}
        )
      `;

      // Reset all document processing status
      await sql`
        UPDATE documents
        SET last_analyzed = NULL
        WHERE project_id = ${projectId}
      `;

      return NextResponse.json({
        success: true,
        message: 'All project chunks deleted successfully',
        project_id: projectId
      });
    }

  } catch (error) {
    console.error('Error in DELETE /api/projects/[id]/chunks:', error);

    if (error instanceof Error) {
      if (error.message.includes('token') || error.message.includes('unauthorized')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please sign out and sign in again.' },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to delete chunks', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}