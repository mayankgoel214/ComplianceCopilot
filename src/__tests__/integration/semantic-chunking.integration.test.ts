import { DocumentProcessor } from '@/lib/processing/document-processor';
import { ChunkRetriever } from '@/lib/retrieval/chunk-retriever';
import { ChromaVectorService } from '@/lib/vector/chroma-service';
import { SemanticChunker } from '@/lib/processing/semantic-chunker';
import { DocumentStructureParser } from '@/lib/processing/structure-parser';

// Mock external dependencies
jest.mock('@/lib/google-drive/drive-service', () => ({
  getDriveService: jest.fn().mockResolvedValue({
    getFileContent: jest.fn().mockResolvedValue({
      content: `# Test Document

## Introduction
This is a comprehensive test document that contains multiple sections and various types of content to thoroughly test the semantic chunking system.

The introduction provides an overview of what we're testing and sets the context for the rest of the document.

## Technical Background

### System Architecture
Our system consists of several key components that work together to provide semantic chunking capabilities:

- Document structure parser for extracting hierarchy
- Semantic boundary detector for finding natural break points
- Hybrid chunking engine for creating optimal chunks
- Vector storage system for efficient retrieval

### Implementation Details
The implementation uses a combination of structural analysis and semantic understanding to create meaningful document chunks.

#### Parser Component
The parser analyzes document structure including:

1. Heading hierarchy (H1, H2, H3, etc.)
2. Paragraph boundaries
3. List structures
4. Table content
5. Code blocks

#### Chunking Algorithm
The chunking algorithm operates in several phases:

1. **Structure Analysis**: Parse document hierarchy
2. **Semantic Analysis**: Identify topic boundaries
3. **Chunk Generation**: Create optimized chunks
4. **Overlap Addition**: Add context overlap
5. **Relationship Mapping**: Establish chunk relationships

## Experimental Results

### Performance Metrics
Our testing shows significant improvements in chunk quality:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Coherence | 0.65 | 0.89 | +37% |
| Retrieval | 0.72 | 0.94 | +31% |
| User Satisfaction | 3.2/5 | 4.7/5 | +47% |

### Qualitative Analysis
User feedback indicates that the semantic chunking approach provides:

- Better context preservation
- More relevant search results
- Improved navigation experience
- Enhanced content understanding

## Advanced Features

### Multi-Strategy Retrieval
The system supports multiple retrieval strategies:

\`\`\`typescript
// Semantic search using embeddings
const semanticResults = await retriever.retrieveChunks(
  projectId,
  'machine learning algorithms',
  'semantic'
);

// Hierarchical navigation
const hierarchicalResults = await retriever.retrieveChunks(
  projectId,
  'section: methodology',
  'hierarchical'
);

// Hybrid approach combining both
const hybridResults = await retriever.retrieveChunks(
  projectId,
  'data analysis techniques',
  'hybrid'
);
\`\`\`

### Context Expansion
The system can expand search results with surrounding context:

- **Previous chunks**: Content that comes before
- **Next chunks**: Content that follows
- **Parent chunks**: Higher-level headings
- **Child chunks**: Nested content

### Real-time Processing
Documents can be processed in real-time with:

- **Incremental updates**: Only changed sections
- **Progress tracking**: Real-time status updates
- **Error recovery**: Graceful handling of failures
- **Background processing**: Non-blocking operations

## Use Cases

### Academic Research
Researchers can use the system to:

1. Index large document collections
2. Find related research papers
3. Extract relevant sections
4. Track citation networks

### Technical Documentation
Development teams benefit from:

- **API documentation search**: Find specific endpoints
- **Code example retrieval**: Locate implementation patterns
- **Architecture navigation**: Browse system components
- **Tutorial progression**: Follow learning paths

### Legal Document Analysis
Legal professionals can:

- Search case law effectively
- Find relevant precedents
- Analyze contract clauses
- Track regulatory changes

## Conclusion

The semantic chunking system represents a significant advancement in document processing technology. By combining structural analysis with semantic understanding, we achieve superior results across multiple metrics.

### Key Achievements
1. **Improved Accuracy**: 37% better semantic coherence
2. **Better User Experience**: 47% increase in satisfaction
3. **Flexible Retrieval**: Multiple search strategies
4. **Scalable Architecture**: Handles large document collections

### Future Directions
Future work will focus on:

- **Multi-modal support**: Images and tables
- **Domain specialization**: Custom models for specific fields
- **Real-time collaboration**: Shared document spaces
- **Advanced analytics**: Usage patterns and optimization

The system is ready for production deployment and can handle diverse document types effectively.`,
      mimeType: 'text/plain',
      extractedAt: new Date()
    }),
    getFileMetadata: jest.fn().mockResolvedValue({
      id: 'file-123',
      name: 'integration-test.md',
      mimeType: 'text/plain',
      size: '10000',
      modifiedTime: new Date().toISOString(),
      webViewLink: 'https://drive.google.com/file/123'
    })
  })
}));

jest.mock('@/lib/db/documents-service', () => ({
  DocumentsService: jest.fn().mockImplementation(() => ({
    createDocument: jest.fn().mockResolvedValue({
      id: 'doc-123',
      project_id: 'project-123',
      drive_file_id: 'file-123',
      file_name: 'integration-test.md'
    }),
    getDocumentsByProjectId: jest.fn().mockResolvedValue([
      {
        id: 'doc-123',
        drive_file_id: 'file-123',
        file_name: 'integration-test.md'
      }
    ])
  }))
}));

jest.mock('@/lib/db/neon-client', () => ({
  sql: jest.fn().mockImplementation((strings, ...values) => {
    const query = strings.join('');

    if (query.includes('INSERT INTO document_chunks')) {
      return Promise.resolve([{ id: 'chunk-inserted' }]);
    }

    if (query.includes('INSERT INTO processing_jobs')) {
      return Promise.resolve([{ id: 'job-created' }]);
    }

    if (query.includes('UPDATE processing_jobs')) {
      return Promise.resolve([{ affected: 1 }]);
    }

    if (query.includes('UPDATE documents')) {
      return Promise.resolve([{ affected: 1 }]);
    }

    if (query.includes('SELECT') && query.includes('document_chunks')) {
      return Promise.resolve([
        {
          id: 'chunk-1',
          document_id: 'doc-123',
          content: 'Test chunk content',
          tokens: 150,
          position: 0,
          heading_path: ['Introduction'],
          hierarchy_level: 1,
          chunk_type: 'paragraph',
          semantic_density: 0.8,
          topic_keywords: ['test', 'document'],
          created_at: new Date()
        }
      ]);
    }

    return Promise.resolve([]);
  })
}));

// Mock ChromaDB
const mockChromaCollection = {
  add: jest.fn().mockResolvedValue(true),
  query: jest.fn().mockResolvedValue({
    ids: [['chunk-1']],
    documents: [['Test chunk content']],
    metadatas: [[{
      chunk_id: 'chunk-1',
      document_id: 'doc-123',
      chunk_type: 'paragraph',
      hierarchy_level: 1
    }]],
    distances: [[0.1]]
  }),
  count: jest.fn().mockResolvedValue(5),
  get: jest.fn().mockResolvedValue({
    ids: ['chunk-1'],
    documents: ['Test chunk content'],
    metadatas: [{
      chunk_id: 'chunk-1',
      document_id: 'doc-123'
    }]
  }),
  delete: jest.fn().mockResolvedValue(true)
};

jest.mock('chromadb', () => ({
  ChromaApi: jest.fn().mockImplementation(() => ({
    createCollection: jest.fn().mockResolvedValue(mockChromaCollection),
    getCollection: jest.fn().mockResolvedValue(mockChromaCollection),
    listCollections: jest.fn().mockResolvedValue([mockChromaCollection]),
    deleteCollection: jest.fn().mockResolvedValue(true)
  }))
}));

describe('Semantic Chunking Integration Tests', () => {
  let processor: DocumentProcessor;
  let retriever: ChunkRetriever;
  let chromaService: ChromaVectorService;

  beforeEach(async () => {
    processor = new DocumentProcessor();
    retriever = new ChunkRetriever();
    chromaService = new ChromaVectorService();

    // Initialize ChromaDB service
    await chromaService.initialize();
  });

  afterEach(async () => {
    // Cleanup
    if (chromaService) {
      await chromaService.close();
    }
  });

  describe('End-to-End Document Processing', () => {
    test('should process document through complete pipeline', async () => {
      const projectId = 'integration-project-123';
      const driveFileId = 'integration-file-123';
      const oauthToken = 'mock-oauth-token';

      // Process the document
      const result = await processor.processDocument(
        projectId,
        driveFileId,
        oauthToken,
        {
          chunking_config: {
            min_chunk_size: 100,
            max_chunk_size: 400,
            target_chunk_size: 250,
            overlap_percentage: 10
          },
          force_reprocess: false,
          include_embeddings: true,
          store_in_vector_db: true
        }
      );

      // Verify processing result
      expect(result.job_id).toBeDefined();
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.metrics.total_chunks).toBeGreaterThan(0);
      expect(result.metrics.processing_time_ms).toBeGreaterThan(0);

      // Verify chunks have proper structure
      result.chunks.forEach(chunk => {
        expect(chunk.id).toBeDefined();
        expect(chunk.document_id).toBeDefined();
        expect(chunk.content).toBeDefined();
        expect(chunk.tokens).toBeGreaterThan(0);
        expect(chunk.heading_path).toBeDefined();
        expect(chunk.chunk_type).toBeDefined();
        expect(chunk.metadata).toBeDefined();
      });

      // Verify embeddings were generated
      expect(result.embeddings).toBeDefined();
      expect(result.embeddings?.length).toBe(result.chunks.length);
    });

    test('should handle project-wide processing', async () => {
      const projectId = 'integration-project-456';
      const oauthToken = 'mock-oauth-token';

      // Process entire project
      const results = await processor.processProject(
        projectId,
        oauthToken,
        {
          chunking_config: {
            min_chunk_size: 100,
            max_chunk_size: 300,
            target_chunk_size: 200
          }
        }
      );

      expect(results.length).toBeGreaterThan(0);

      results.forEach(result => {
        expect(result.job_id).toBeDefined();
        expect(result.metrics.total_chunks).toBeGreaterThan(0);
      });
    });
  });

  describe('Retrieval System Integration', () => {
    beforeEach(async () => {
      // Setup test data by processing a document first
      const projectId = 'retrieval-test-project';
      await processor.processDocument(
        projectId,
        'test-file-123',
        'mock-oauth-token'
      );
    });

    test('should perform semantic search across different strategies', async () => {
      const projectId = 'retrieval-test-project';
      const query = 'semantic chunking algorithm';

      // Test different retrieval strategies
      const strategies = ['semantic', 'hierarchical', 'hybrid', 'contextual', 'keyword'] as const;

      for (const strategy of strategies) {
        const result = await retriever.retrieveChunks(
          projectId,
          query,
          strategy,
          { max_results: 5 }
        );

        expect(result.chunks.length).toBeLessThanOrEqual(5);
        expect(result.query_strategy).toBe(strategy);
        expect(result.processing_time_ms).toBeGreaterThan(0);
        expect(result.aggregated_metadata).toBeDefined();
      }
    });

    test('should retrieve related chunks with proper relationships', async () => {
      const projectId = 'retrieval-test-project';
      const chunkId = 'chunk-1';

      const relatedChunks = await retriever.getRelatedChunks(
        chunkId,
        projectId,
        {
          max_results: 10,
          include_siblings: true,
          include_parent_children: true,
          similarity_threshold: 0.6
        }
      );

      expect(Array.isArray(relatedChunks)).toBe(true);

      relatedChunks.forEach(chunk => {
        expect(chunk.id).toBeDefined();
        expect(chunk.id).not.toBe(chunkId); // Should not include source chunk
        expect(chunk.content).toBeDefined();
      });
    });

    test('should browse document structure hierarchy', async () => {
      const projectId = 'retrieval-test-project';

      const structureResult = await retriever.browseByStructure(
        projectId,
        {
          max_depth: 3,
          include_content: true
        }
      );

      expect(structureResult.structure).toBeDefined();
      expect(structureResult.total_headings).toBeGreaterThan(0);

      structureResult.structure.forEach(section => {
        expect(section.heading).toBeDefined();
        expect(section.heading.id).toBeDefined();
        expect(section.heading.content).toBeDefined();
        expect(section.depth).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(section.children)).toBe(true);
      });
    });

    test('should handle filtered searches correctly', async () => {
      const projectId = 'retrieval-test-project';
      const query = 'test content';

      // Test document-specific search
      const documentFilteredResult = await retriever.retrieveChunks(
        projectId,
        query,
        'semantic',
        {
          filter_by_document: 'doc-123',
          max_results: 10
        }
      );

      expect(documentFilteredResult.chunks.length).toBeLessThanOrEqual(10);

      // Verify all results are from the specified document
      documentFilteredResult.chunks.forEach(chunk => {
        expect(chunk.document_id).toBe('doc-123');
      });

      // Test hierarchy-level search
      const hierarchyFilteredResult = await retriever.retrieveChunks(
        projectId,
        query,
        'hierarchical',
        {
          hierarchy_level: 1,
          max_results: 10
        }
      );

      hierarchyFilteredResult.chunks.forEach(chunk => {
        expect(chunk.hierarchy_level).toBe(1);
      });
    });
  });

  describe('Vector Storage Integration', () => {
    test('should store and retrieve chunks from ChromaDB', async () => {
      const projectId = 'vector-test-project';

      // Create test chunks
      const testChunks = [
        {
          id: 'test-chunk-1',
          document_id: 'test-doc-1',
          content: 'This is the first test chunk about machine learning algorithms.',
          tokens: 120,
          position: 0,
          heading_path: ['Introduction', 'Machine Learning'],
          hierarchy_level: 2,
          chunk_type: 'paragraph' as const,
          semantic_density: 0.85,
          topic_keywords: ['machine', 'learning', 'algorithms'],
          has_overlap_previous: false,
          has_overlap_next: true,
          sibling_chunk_ids: [],
          child_chunk_ids: [],
          metadata: {
            created_at: new Date(),
            source_file_id: 'file-1',
            source_file_name: 'ml-guide.md',
            chunking_method: 'hybrid' as const
          }
        },
        {
          id: 'test-chunk-2',
          document_id: 'test-doc-1',
          content: 'This is the second test chunk about neural networks and deep learning.',
          tokens: 130,
          position: 1,
          heading_path: ['Introduction', 'Neural Networks'],
          hierarchy_level: 2,
          chunk_type: 'paragraph' as const,
          semantic_density: 0.88,
          topic_keywords: ['neural', 'networks', 'deep', 'learning'],
          has_overlap_previous: true,
          has_overlap_next: false,
          sibling_chunk_ids: [],
          child_chunk_ids: [],
          metadata: {
            created_at: new Date(),
            source_file_id: 'file-1',
            source_file_name: 'ml-guide.md',
            chunking_method: 'hybrid' as const
          }
        }
      ];

      // Generate mock embeddings
      const testEmbeddings = testChunks.map(() =>
        Array.from({ length: 768 }, () => Math.random())
      );

      // Store chunks in ChromaDB
      await chromaService.addDocumentChunks(projectId, testChunks, testEmbeddings);

      // Verify collection was created
      const collectionInfo = await chromaService.getCollectionInfo(projectId);
      expect(collectionInfo).toBeDefined();
      expect(collectionInfo?.name).toContain(projectId.replace(/-/g, '_'));

      // Test querying by similarity
      const queryEmbedding = Array.from({ length: 768 }, () => Math.random());
      const queryResult = await chromaService.queryBySemanticSimilarity(
        projectId,
        queryEmbedding,
        { n_results: 5 }
      );

      expect(queryResult.ids.length).toBeGreaterThan(0);
      expect(queryResult.documents.length).toBe(queryResult.ids.length);
      expect(queryResult.metadatas.length).toBe(queryResult.ids.length);

      // Test getting chunks by document
      const documentChunks = await chromaService.getChunksByDocument(projectId, 'test-doc-1');
      expect(documentChunks.ids.length).toBeGreaterThan(0);

      // Test getting all chunks
      const allChunks = await chromaService.getAllChunks(projectId);
      expect(allChunks.ids.length).toBeGreaterThan(0);
    });

    test('should handle collection cleanup correctly', async () => {
      const projectId = 'cleanup-test-project';

      // Create collection with test data
      const collection = await chromaService.getOrCreateCollection(projectId);
      expect(collection).toBeDefined();

      // Delete by document
      await chromaService.deleteChunksByDocument(projectId, 'test-doc-1');

      // Delete entire collection
      await chromaService.deleteProjectCollection(projectId);

      // Verify collection is removed
      const deletedCollectionInfo = await chromaService.getCollectionInfo(projectId);
      // Collection should be recreated as empty when queried
      expect(deletedCollectionInfo?.count).toBe(0);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle processing failures gracefully', async () => {
      // Mock a drive service failure
      jest.doMock('@/lib/google-drive/drive-service', () => ({
        getDriveService: jest.fn().mockResolvedValue({
          getFileContent: jest.fn().mockRejectedValue(new Error('Network error')),
          getFileMetadata: jest.fn().mockRejectedValue(new Error('Network error'))
        })
      }));

      const projectId = 'error-test-project';
      const driveFileId = 'failing-file-123';
      const oauthToken = 'mock-oauth-token';

      await expect(processor.processDocument(
        projectId,
        driveFileId,
        oauthToken
      )).rejects.toThrow('Network error');
    });

    test('should handle empty documents', async () => {
      // Mock empty document content
      jest.doMock('@/lib/google-drive/drive-service', () => ({
        getDriveService: jest.fn().mockResolvedValue({
          getFileContent: jest.fn().mockResolvedValue({
            content: '',
            mimeType: 'text/plain',
            extractedAt: new Date()
          }),
          getFileMetadata: jest.fn().mockResolvedValue({
            id: 'empty-file-123',
            name: 'empty.md',
            mimeType: 'text/plain'
          })
        })
      }));

      const chunker = new SemanticChunker();
      const result = await chunker.chunkDocument(
        '',
        'empty-doc-123',
        'empty-file-123',
        'empty.md'
      );

      expect(result.chunks.length).toBe(0);
      expect(result.total_chunks).toBe(0);
    });

    test('should handle malformed document content', async () => {
      const malformedContent = `
      ### Missing H1 and H2
      Content without proper hierarchy

      #### H4 without H3
      More content

      Random text without structure

      | Broken | Table
      |--------|
      | Missing | cell |

      \`\`\`
      Unclosed code block
      `;

      const parser = new DocumentStructureParser();
      const structure = parser.parseDocument(malformedContent);

      // Should still parse successfully
      expect(structure.nodes.length).toBeGreaterThan(0);

      const chunker = new SemanticChunker();
      const result = await chunker.chunkDocument(
        malformedContent,
        'malformed-doc-123',
        'malformed-file-123',
        'malformed.md'
      );

      // Should create chunks despite malformed structure
      expect(result.chunks.length).toBeGreaterThan(0);
    });

    test('should handle ChromaDB connection failures', async () => {
      // Mock ChromaDB failure
      const failingChromaService = new ChromaVectorService();

      // Mock the client to fail
      (failingChromaService as any).client = {
        createCollection: jest.fn().mockRejectedValue(new Error('ChromaDB connection failed')),
        getCollection: jest.fn().mockRejectedValue(new Error('ChromaDB connection failed'))
      };

      await expect(failingChromaService.getOrCreateCollection('test-project')).rejects.toThrow();
    });
  });

  describe('Performance and Scalability', () => {
    test('should handle large documents efficiently', async () => {
      // Generate large document content
      const largeSections = Array.from({ length: 20 }, (_, i) => `
## Section ${i + 1}
${Array.from({ length: 10 }, (_, j) => `
### Subsection ${i + 1}.${j + 1}
This is a substantial paragraph with detailed content that provides comprehensive coverage of the topic.
The content includes multiple sentences with varying complexity and structure to test the chunking algorithm.
We want to ensure that semantic boundaries are detected correctly even in large documents.

Additional paragraphs provide more context and depth to the discussion.
This helps test the system's ability to maintain coherence across larger text segments.
`).join('\n')}
`).join('\n');

      const largeContent = `# Large Document Test\n\n${largeSections}`;

      const startTime = Date.now();
      const chunker = new SemanticChunker();
      const result = await chunker.chunkDocument(
        largeContent,
        'large-doc-123',
        'large-file-123',
        'large-document.md',
        {
          min_chunk_size: 200,
          max_chunk_size: 500,
          target_chunk_size: 350
        }
      );
      const processingTime = Date.now() - startTime;

      // Verify performance
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.chunks.length).toBeGreaterThan(20);
      expect(result.total_tokens).toBeGreaterThan(5000);

      // Verify quality is maintained
      expect(result.semantic_coherence).toBeGreaterThan(0.5);
      expect(result.hierarchy_preservation).toBeGreaterThan(0.7);
    });

    test('should handle batch processing efficiently', async () => {
      const projectId = 'batch-test-project';
      const oauthToken = 'mock-oauth-token';

      // Mock multiple documents
      jest.doMock('@/lib/db/documents-service', () => ({
        DocumentsService: jest.fn().mockImplementation(() => ({
          getDocumentsByProjectId: jest.fn().mockResolvedValue(
            Array.from({ length: 5 }, (_, i) => ({
              id: `doc-${i}`,
              drive_file_id: `file-${i}`,
              file_name: `document-${i}.md`
            }))
          )
        }))
      }));

      const startTime = Date.now();
      const results = await processor.processProject(projectId, oauthToken);
      const processingTime = Date.now() - startTime;

      expect(results.length).toBe(5);
      expect(processingTime).toBeLessThan(30000); // Should complete within 30 seconds

      results.forEach(result => {
        expect(result.job_id).toBeDefined();
        expect(result.metrics).toBeDefined();
      });
    });
  });

  describe('Data Consistency and Integrity', () => {
    test('should maintain referential integrity across components', async () => {
      const projectId = 'integrity-test-project';
      const documentId = 'test-doc-456';

      // Process document
      const result = await processor.processDocument(
        projectId,
        'test-file-456',
        'mock-oauth-token'
      );

      // Verify chunk relationships
      result.chunks.forEach((chunk, index) => {
        // Check document reference
        expect(chunk.document_id).toBeDefined();

        // Check position sequencing
        expect(chunk.position).toBe(index);

        // Check metadata consistency
        expect(chunk.metadata.source_file_id).toBeDefined();
        expect(chunk.metadata.source_file_name).toBeDefined();
        expect(chunk.metadata.created_at).toBeInstanceOf(Date);
      });

      // Verify adjacent chunk relationships
      for (let i = 0; i < result.chunks.length - 1; i++) {
        const currentChunk = result.chunks[i];
        const nextChunk = result.chunks[i + 1];

        if (currentChunk.next_chunk_id) {
          expect(currentChunk.next_chunk_id).toBe(nextChunk.id);
        }

        if (nextChunk.previous_chunk_id) {
          expect(nextChunk.previous_chunk_id).toBe(currentChunk.id);
        }
      }
    });

    test('should handle concurrent processing safely', async () => {
      const projectId = 'concurrent-test-project';
      const oauthToken = 'mock-oauth-token';

      // Start multiple processing operations concurrently
      const promises = Array.from({ length: 3 }, (_, i) =>
        processor.processDocument(
          projectId,
          `concurrent-file-${i}`,
          oauthToken
        )
      );

      const results = await Promise.allSettled(promises);

      // All operations should complete successfully
      results.forEach((result, index) => {
        expect(result.status).toBe('fulfilled');
        if (result.status === 'fulfilled') {
          expect(result.value.job_id).toBeDefined();
          expect(result.value.chunks.length).toBeGreaterThan(0);
        }
      });
    });
  });
});