import { NextRequest } from 'next/server';
import { POST as processPost } from '../process/route';
import { GET as statusGet } from '../processing-status/route';
import { GET as chunksGet, DELETE as chunksDelete } from '../chunks/route';
import { POST as searchPost, GET as searchGet } from '../search/route';
import { GET as hierarchyGet } from '../hierarchy/route';

// Mock dependencies
jest.mock('firebase-admin', () => ({
  auth: () => ({
    verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-user' })
  })
}));

jest.mock('@/lib/processing/document-processor', () => ({
  getDocumentProcessor: () => ({
    processDocument: jest.fn().mockResolvedValue({
      job_id: 'job-123',
      chunks: [
        {
          id: 'chunk-1',
          document_id: 'doc-1',
          content: 'Test chunk content',
          tokens: 100,
          position: 0,
          heading_path: ['Introduction'],
          hierarchy_level: 1,
          chunk_type: 'paragraph',
          semantic_density: 0.8,
          topic_keywords: ['test', 'content'],
          metadata: {
            created_at: new Date(),
            source_file_id: 'file-1',
            source_file_name: 'test.md',
            chunking_method: 'hybrid'
          }
        }
      ],
      metrics: {
        total_chunks: 1,
        total_tokens: 100,
        average_chunk_size: 100,
        processing_time_ms: 1000,
        semantic_coherence: 0.8
      }
    }),
    processProject: jest.fn().mockResolvedValue([
      {
        job_id: 'job-123',
        chunks: [],
        metrics: {
          total_chunks: 5,
          total_tokens: 500,
          average_chunk_size: 100,
          processing_time_ms: 5000,
          semantic_coherence: 0.75
        }
      }
    ]),
    getJobStatus: jest.fn().mockResolvedValue({
      job_id: 'job-123',
      project_id: 'project-123',
      status: 'completed',
      progress: {
        total_documents: 1,
        processed_documents: 1,
        total_chunks: 5,
        processed_chunks: 5,
        current_operation: 'Completed'
      },
      timing: {
        started_at: new Date(),
        completed_at: new Date(),
        duration_seconds: 10
      }
    })
  })
}));

jest.mock('@/lib/retrieval/chunk-retriever', () => ({
  getChunkRetriever: () => ({
    retrieveChunks: jest.fn().mockResolvedValue({
      chunks: [
        {
          id: 'chunk-1',
          document_id: 'doc-1',
          content: 'Search result content',
          similarity_score: 0.9,
          heading_path: ['Section 1'],
          chunk_type: 'paragraph',
          metadata: {
            source_file_name: 'test.md'
          }
        }
      ],
      total_found: 1,
      query_strategy: 'hybrid',
      processing_time_ms: 100,
      aggregated_metadata: {
        documents_covered: ['doc-1'],
        heading_paths_covered: ['Section 1'],
        hierarchy_levels: [1],
        average_similarity: 0.9
      }
    }),
    getRelatedChunks: jest.fn().mockResolvedValue([
      {
        id: 'chunk-2',
        content: 'Related chunk content',
        similarity_score: 0.7,
        metadata: { source_file_name: 'test.md' }
      }
    ]),
    browseByStructure: jest.fn().mockResolvedValue({
      structure: [
        {
          heading: {
            id: 'heading-1',
            content: 'Main Section',
            hierarchy_level: 1
          },
          children: [],
          depth: 1
        }
      ],
      total_headings: 1
    })
  })
}));

jest.mock('@/lib/db/neon-client', () => ({
  sql: jest.fn().mockImplementation((strings, ...values) => {
    // Mock different SQL queries based on the query string
    const query = strings.join('');

    if (query.includes('processing_jobs')) {
      return Promise.resolve([
        {
          id: 'job-123',
          project_id: 'project-123',
          status: 'completed',
          total_documents: 1,
          processed_documents: 1,
          total_chunks: 5,
          processed_chunks: 5
        }
      ]);
    }

    if (query.includes('document_chunks')) {
      return Promise.resolve([
        {
          id: 'chunk-1',
          document_id: 'doc-1',
          content: 'Test content',
          tokens: 100,
          position: 0,
          file_name: 'test.md'
        }
      ]);
    }

    if (query.includes('COUNT')) {
      return Promise.resolve([{ total: 5, chunk_count: 5 }]);
    }

    return Promise.resolve([]);
  })
}));

// Helper function to create mock request
function createMockRequest(
  url: string,
  method: string = 'GET',
  body?: any,
  headers: Record<string, string> = {}
): NextRequest {
  const defaultHeaders = {
    'authorization': 'Bearer valid-token',
    'x-google-access-token': 'valid-oauth-token',
    ...headers
  };

  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: defaultHeaders
  });
}

// Helper function to create mock params
function createMockParams(id: string) {
  return Promise.resolve({ id });
}

describe('API Endpoints', () => {
  describe('POST /api/projects/[id]/process', () => {
    test('should process entire project successfully', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/process',
        'POST',
        {
          force_reprocess: false,
          include_embeddings: true,
          store_in_vector_db: true
        }
      );

      const response = await processPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
      expect(data.total_documents).toBeDefined();
    });

    test('should process specific documents when document_ids provided', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/process',
        'POST',
        {
          document_ids: ['doc-1', 'doc-2'],
          force_reprocess: true
        }
      );

      const response = await processPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.results).toBeDefined();
    });

    test('should handle missing OAuth token', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/process',
        'POST',
        {},
        { 'x-google-access-token': '' }
      );

      const response = await processPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Google OAuth access token required');
    });

    test('should handle missing project ID', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects//process',
        'POST'
      );

      const response = await processPost(request, { params: createMockParams('') });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Project ID is required');
    });
  });

  describe('GET /api/projects/[id]/processing-status', () => {
    test('should get project processing status', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/processing-status'
      );

      const response = await statusGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.project_id).toBe('project-123');
      expect(data.processing_status).toBeDefined();
      expect(data.statistics).toBeDefined();
      expect(data.recent_jobs).toBeDefined();
    });

    test('should get specific job status when job_id provided', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/processing-status?job_id=job-123'
      );

      const response = await statusGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.job).toBeDefined();
      expect(data.job.job_id).toBe('job-123');
    });

    test('should handle non-existent job', async () => {
      // Mock getJobStatus to return null for non-existent job
      jest.doMock('@/lib/processing/document-processor', () => ({
        getDocumentProcessor: () => ({
          getJobStatus: jest.fn().mockResolvedValue(null)
        })
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/processing-status?job_id=non-existent'
      );

      const response = await statusGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toContain('Job not found');
    });
  });

  describe('GET /api/projects/[id]/chunks', () => {
    test('should retrieve chunks with pagination', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks?limit=10&offset=0'
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.chunks).toBeDefined();
      expect(data.pagination).toBeDefined();
      expect(data.statistics).toBeDefined();
      expect(data.chunk_type_distribution).toBeDefined();
    });

    test('should filter chunks by document_id', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks?document_id=doc-1'
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters_applied.document_id).toBe('doc-1');
    });

    test('should filter chunks by chunk_type', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks?chunk_type=heading'
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.filters_applied.chunk_type).toBe('heading');
    });

    test('should include context when requested', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks?include_context=true'
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      // Context chunks should be included in response
      if (data.chunks.length > 0) {
        expect(data.chunks[0].context_chunks).toBeDefined();
      }
    });
  });

  describe('DELETE /api/projects/[id]/chunks', () => {
    test('should delete all project chunks when confirmed', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks',
        'DELETE',
        { confirm: true }
      );

      const response = await chunksDelete(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toContain('All project chunks deleted');
    });

    test('should delete specific document chunks', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks',
        'DELETE',
        {
          document_id: 'doc-1',
          confirm: true
        }
      );

      const response = await chunksDelete(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.document_id).toBe('doc-1');
    });

    test('should require confirmation for deletion', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks',
        'DELETE',
        { confirm: false }
      );

      const response = await chunksDelete(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Deletion must be confirmed');
    });
  });

  describe('POST /api/projects/[id]/search', () => {
    test('should perform semantic search', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search',
        'POST',
        {
          query: 'test search query',
          strategy: 'semantic',
          max_results: 5
        }
      );

      const response = await searchPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.query.text).toBe('test search query');
      expect(data.results.chunks).toBeDefined();
      expect(data.search_metadata.strategy_used).toBe('hybrid');
    });

    test('should perform hybrid search with filters', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search',
        'POST',
        {
          query: 'filtered search',
          strategy: 'hybrid',
          max_results: 10,
          filters: {
            document_id: 'doc-1',
            chunk_type: 'paragraph'
          }
        }
      );

      const response = await searchPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.search_metadata.filters_applied.document_id).toBe('doc-1');
      expect(data.search_metadata.filters_applied.chunk_type).toBe('paragraph');
    });

    test('should handle empty query', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search',
        'POST',
        {
          query: '',
          strategy: 'semantic'
        }
      );

      const response = await searchPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Query cannot be empty');
    });

    test('should handle invalid strategy', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search',
        'POST',
        {
          query: 'test query',
          strategy: 'invalid_strategy'
        }
      );

      const response = await searchPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid strategy');
    });
  });

  describe('GET /api/projects/[id]/search', () => {
    test('should get related chunks for a specific chunk', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search?chunk_id=chunk-1&max_results=5'
      );

      const response = await searchGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.source_chunk_id).toBe('chunk-1');
      expect(data.related_chunks).toBeDefined();
    });

    test('should handle missing chunk_id parameter', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search'
      );

      const response = await searchGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('chunk_id parameter is required');
    });
  });

  describe('GET /api/projects/[id]/hierarchy', () => {
    test('should get document hierarchy for entire project', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/hierarchy'
      );

      const response = await hierarchyGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.hierarchy).toBeDefined();
      expect(data.documents).toBeDefined();
      expect(data.statistics).toBeDefined();
    });

    test('should filter hierarchy by document_id', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/hierarchy?document_id=doc-1'
      );

      const response = await hierarchyGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metadata.filters_applied.document_id).toBe('doc-1');
    });

    test('should respect max_depth parameter', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/hierarchy?max_depth=2'
      );

      const response = await hierarchyGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metadata.filters_applied.max_depth).toBe(2);
    });

    test('should include metrics when requested', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/hierarchy?include_metrics=true'
      );

      const response = await hierarchyGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.metadata.include_metrics).toBe(true);
      expect(data.chunk_type_distribution).toBeDefined();
      expect(data.heading_distribution).toBeDefined();
    });
  });

  describe('Authentication and Error Handling', () => {
    test('should handle missing authorization header', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks',
        'GET',
        undefined,
        { authorization: '' }
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Authentication failed');
    });

    test('should handle invalid authorization format', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks',
        'GET',
        undefined,
        { authorization: 'InvalidFormat token' }
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toContain('Authentication failed');
    });

    test('should handle malformed JSON in request body', async () => {
      const request = new NextRequest('http://localhost:3000/api/projects/project-123/search', {
        method: 'POST',
        body: 'invalid json {',
        headers: {
          'authorization': 'Bearer valid-token'
        }
      });

      const response = await searchPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(400);
    });

    test('should handle database connection errors gracefully', async () => {
      // Mock SQL to throw an error
      jest.doMock('@/lib/db/neon-client', () => ({
        sql: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      }));

      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks'
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toContain('Failed to retrieve chunks');
    });
  });

  describe('Input Validation', () => {
    test('should validate pagination parameters', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/chunks?limit=1000&offset=-1'
      );

      const response = await chunksGet(request, { params: createMockParams('project-123') });

      // Should handle invalid pagination gracefully
      expect(response.status).toBe(200);
    });

    test('should validate search parameters', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search',
        'POST',
        {
          query: 'test',
          max_results: 1000, // Should be clamped
          similarity_threshold: 2.0 // Should be clamped
        }
      );

      const response = await searchPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      // API should clamp values to valid ranges
      expect(data.query.options.max_results).toBeLessThanOrEqual(100);
      expect(data.query.options.similarity_threshold).toBeLessThanOrEqual(1);
    });

    test('should handle special characters in search query', async () => {
      const request = createMockRequest(
        'http://localhost:3000/api/projects/project-123/search',
        'POST',
        {
          query: 'test & query with "special" chars: [brackets] {braces} <tags>',
          strategy: 'keyword'
        }
      );

      const response = await searchPost(request, { params: createMockParams('project-123') });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });
});