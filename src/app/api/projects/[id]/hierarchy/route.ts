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

interface HierarchyNode {
  id: string;
  document_id: string;
  document_name: string;
  content: string;
  position: number;
  tokens: number;
  heading_path: string[];
  hierarchy_level: number;
  chunk_type: string;
  children: HierarchyNode[];
  chunk_count?: number;
  total_tokens?: number;
}

// GET /api/projects/[id]/hierarchy - Get document structure hierarchy
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
    const maxDepth = parseInt(url.searchParams.get('max_depth') || '10');
    const includeContent = url.searchParams.get('include_content') !== 'false';
    const includeMetrics = url.searchParams.get('include_metrics') === 'true';
    const chunkTypesFilter = url.searchParams.get('chunk_types')?.split(',') || [];

    const retriever = getChunkRetriever();

    // Get structured hierarchy using the retriever
    const structureResult = await retriever.browseByStructure(projectId, {
      document_id: documentId,
      max_depth: maxDepth,
      include_content: includeContent
    });

    // Get all documents in the project for overview
    const documents = await sql`
      SELECT
        d.id,
        d.file_name,
        d.drive_file_id,
        d.mime_type,
        d.last_analyzed,
        COUNT(dc.id) as chunk_count,
        SUM(dc.tokens) as total_tokens,
        MAX(dc.hierarchy_level) as max_depth
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.project_id = ${projectId}
      ${documentId ? sql`AND d.id = ${documentId}` : sql``}
      GROUP BY d.id, d.file_name, d.drive_file_id, d.mime_type, d.last_analyzed
      ORDER BY d.file_name
    `;

    // Build hierarchical structure
    const hierarchy: HierarchyNode[] = [];

    if (documentId) {
      // Single document hierarchy
      const documentChunks = await sql`
        SELECT
          dc.*,
          d.file_name
        FROM document_chunks dc
        JOIN documents d ON dc.document_id = d.id
        WHERE d.project_id = ${projectId}
        AND dc.document_id = ${documentId}
        ${chunkTypesFilter.length > 0 ? sql`AND dc.chunk_type = ANY(${chunkTypesFilter})` : sql``}
        ORDER BY dc.hierarchy_level, dc.position
      `;

      const documentHierarchy = this.buildDocumentHierarchy(
        documentChunks,
        maxDepth,
        includeContent,
        includeMetrics
      );

      hierarchy.push(...documentHierarchy);
    } else {
      // Multi-document hierarchy
      for (const doc of documents) {
        const documentChunks = await sql`
          SELECT
            dc.*,
            d.file_name
          FROM document_chunks dc
          JOIN documents d ON dc.document_id = d.id
          WHERE dc.document_id = ${doc.id}
          ${chunkTypesFilter.length > 0 ? sql`AND dc.chunk_type = ANY(${chunkTypesFilter})` : sql``}
          ORDER BY dc.hierarchy_level, dc.position
        `;

        if (documentChunks.length > 0) {
          const documentNode: HierarchyNode = {
            id: `doc_${doc.id}`,
            document_id: doc.id,
            document_name: doc.file_name,
            content: doc.file_name,
            position: 0,
            tokens: parseInt(doc.total_tokens) || 0,
            heading_path: [],
            hierarchy_level: 0,
            chunk_type: 'document',
            children: this.buildDocumentHierarchy(
              documentChunks,
              maxDepth,
              includeContent,
              includeMetrics
            ),
            chunk_count: parseInt(doc.chunk_count) || 0,
            total_tokens: parseInt(doc.total_tokens) || 0
          };

          hierarchy.push(documentNode);
        }
      }
    }

    // Calculate project-level statistics
    const projectStats = await sql`
      SELECT
        COUNT(DISTINCT d.id) as total_documents,
        COUNT(DISTINCT dc.id) as total_chunks,
        SUM(dc.tokens) as total_tokens,
        AVG(dc.tokens) as avg_chunk_size,
        AVG(dc.semantic_density) as avg_semantic_density,
        MAX(dc.hierarchy_level) as max_hierarchy_depth,
        COUNT(DISTINCT dc.chunk_type) as unique_chunk_types
      FROM documents d
      LEFT JOIN document_chunks dc ON d.id = dc.document_id
      WHERE d.project_id = ${projectId}
      ${documentId ? sql`AND d.id = ${documentId}` : sql``}
    `;

    const stats = projectStats[0] as any;

    // Get chunk type distribution with hierarchy info
    const chunkTypeStats = await sql`
      SELECT
        dc.chunk_type,
        dc.hierarchy_level,
        COUNT(*) as count,
        SUM(dc.tokens) as total_tokens,
        AVG(dc.semantic_density) as avg_semantic_density
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_id = ${projectId}
      ${documentId ? sql`AND dc.document_id = ${documentId}` : sql``}
      GROUP BY dc.chunk_type, dc.hierarchy_level
      ORDER BY dc.hierarchy_level, dc.chunk_type
    `;

    // Get heading distribution
    const headingDistribution = await sql`
      SELECT
        dc.hierarchy_level,
        COUNT(*) as heading_count,
        AVG(array_length(dc.heading_path, 1)) as avg_path_length
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE d.project_id = ${projectId}
      AND dc.chunk_type = 'heading'
      ${documentId ? sql`AND dc.document_id = ${documentId}` : sql``}
      GROUP BY dc.hierarchy_level
      ORDER BY dc.hierarchy_level
    `;

    return NextResponse.json({
      success: true,
      project_id: projectId,
      hierarchy,
      documents: documents.map((doc: any) => ({
        id: doc.id,
        name: doc.file_name,
        drive_file_id: doc.drive_file_id,
        mime_type: doc.mime_type,
        last_analyzed: doc.last_analyzed,
        chunk_count: parseInt(doc.chunk_count) || 0,
        total_tokens: parseInt(doc.total_tokens) || 0,
        max_depth: parseInt(doc.max_depth) || 0,
        is_processed: !!doc.last_analyzed
      })),
      statistics: {
        total_documents: parseInt(stats.total_documents) || 0,
        total_chunks: parseInt(stats.total_chunks) || 0,
        total_tokens: parseInt(stats.total_tokens) || 0,
        average_chunk_size: Math.round(parseFloat(stats.avg_chunk_size) || 0),
        average_semantic_density: parseFloat(stats.avg_semantic_density) || 0,
        max_hierarchy_depth: parseInt(stats.max_hierarchy_depth) || 0,
        unique_chunk_types: parseInt(stats.unique_chunk_types) || 0
      },
      chunk_type_distribution: chunkTypeStats.map((type: any) => ({
        chunk_type: type.chunk_type,
        hierarchy_level: type.hierarchy_level,
        count: parseInt(type.count),
        total_tokens: parseInt(type.total_tokens),
        average_semantic_density: parseFloat(type.avg_semantic_density) || 0
      })),
      heading_distribution: headingDistribution.map((level: any) => ({
        hierarchy_level: level.hierarchy_level,
        heading_count: parseInt(level.heading_count),
        average_path_length: parseFloat(level.avg_path_length) || 0
      })),
      metadata: {
        filters_applied: {
          document_id: documentId,
          max_depth: maxDepth,
          chunk_types: chunkTypesFilter.length > 0 ? chunkTypesFilter : null
        },
        include_content: includeContent,
        include_metrics: includeMetrics
      }
    });

  } catch (error) {
    console.error('Error in GET /api/projects/[id]/hierarchy:', error);

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
        error: 'Failed to get document hierarchy',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Helper function to build document hierarchy from flat chunk list
function buildDocumentHierarchy(
  chunks: any[],
  maxDepth: number,
  includeContent: boolean,
  includeMetrics: boolean
): HierarchyNode[] {
  const hierarchy: HierarchyNode[] = [];
  const nodeMap = new Map<string, HierarchyNode>();

  // Create nodes for all chunks
  for (const chunk of chunks) {
    if (chunk.hierarchy_level > maxDepth) continue;

    const node: HierarchyNode = {
      id: chunk.id,
      document_id: chunk.document_id,
      document_name: chunk.file_name,
      content: includeContent ? chunk.content : (chunk.content?.substring(0, 100) + '...'),
      position: chunk.position,
      tokens: chunk.tokens,
      heading_path: chunk.heading_path || [],
      hierarchy_level: chunk.hierarchy_level,
      chunk_type: chunk.chunk_type,
      children: []
    };

    if (includeMetrics) {
      node.chunk_count = 1;
      node.total_tokens = chunk.tokens;
    }

    nodeMap.set(chunk.id, node);
  }

  // Build parent-child relationships
  for (const chunk of chunks) {
    if (chunk.hierarchy_level > maxDepth) continue;

    const node = nodeMap.get(chunk.id);
    if (!node) continue;

    if (chunk.parent_section_id && nodeMap.has(chunk.parent_section_id)) {
      const parent = nodeMap.get(chunk.parent_section_id)!;
      parent.children.push(node);

      // Aggregate metrics to parent
      if (includeMetrics) {
        parent.chunk_count = (parent.chunk_count || 0) + 1;
        parent.total_tokens = (parent.total_tokens || 0) + node.tokens;
      }
    } else if (chunk.hierarchy_level === 1 || !chunk.parent_section_id) {
      // Root level nodes
      hierarchy.push(node);
    }
  }

  // Sort children by position
  function sortChildren(nodes: HierarchyNode[]) {
    nodes.forEach(node => {
      node.children.sort((a, b) => a.position - b.position);
      sortChildren(node.children);
    });
  }

  hierarchy.sort((a, b) => a.position - b.position);
  sortChildren(hierarchy);

  return hierarchy;
}