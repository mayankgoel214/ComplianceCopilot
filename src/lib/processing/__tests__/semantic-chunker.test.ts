import { SemanticChunker, ChunkingConfig } from '../semantic-chunker';

// Mock dependencies
jest.mock('../structure-parser');
jest.mock('../semantic-analyzer');
jest.mock('js-tiktoken', () => ({
  getEncoding: () => ({
    encode: (text: string) => Array.from({ length: Math.ceil(text.split(' ').length * 0.75) })
  })
}));

describe('SemanticChunker', () => {
  let chunker: SemanticChunker;

  beforeEach(() => {
    chunker = new SemanticChunker();
  });

  describe('chunkDocument', () => {
    const defaultConfig: ChunkingConfig = {
      min_chunk_size: 100,
      max_chunk_size: 500,
      target_chunk_size: 300,
      overlap_percentage: 10,
      prefer_semantic_boundaries: true,
      respect_section_boundaries: true,
      include_heading_context: true
    };

    test('should chunk a simple document correctly', async () => {
      const content = `# Introduction
This is the introduction to our document. It provides an overview of what we'll be discussing.

## Background
The background section contains important context information that readers need to understand before proceeding with the main content.

### Historical Context
Historically, this field has seen many developments. Early work focused on basic approaches that were limited in scope.

### Current State
Currently, the field has evolved significantly. Modern approaches incorporate advanced techniques and methodologies.

## Methodology
Our methodology consists of several key components that work together to achieve the desired outcomes.

### Data Collection
Data collection was performed using standardized protocols. We gathered information from multiple sources to ensure comprehensive coverage.

### Analysis Process
The analysis process involved multiple stages of data processing and validation to ensure accuracy and reliability.

## Results
The results of our study demonstrate significant improvements over previous approaches.

### Performance Metrics
Performance was measured using standard industry benchmarks. Our approach showed improvements across all measured dimensions.

### Comparison Study
When compared to existing solutions, our approach consistently outperformed alternatives in both speed and accuracy.

## Conclusion
In conclusion, our work represents a significant advancement in the field and opens up new possibilities for future research.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'test-document.md',
        defaultConfig
      );

      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.total_chunks).toBe(result.chunks.length);
      expect(result.total_tokens).toBeGreaterThan(0);
      expect(result.average_chunk_size).toBeGreaterThan(0);

      // Check that chunks respect size constraints
      result.chunks.forEach(chunk => {
        expect(chunk.tokens).toBeGreaterThanOrEqual(defaultConfig.min_chunk_size);
        expect(chunk.tokens).toBeLessThanOrEqual(defaultConfig.max_chunk_size);
      });

      // Check that chunks have proper metadata
      result.chunks.forEach(chunk => {
        expect(chunk.id).toBeDefined();
        expect(chunk.document_id).toBe('doc-123');
        expect(chunk.content).toBeDefined();
        expect(chunk.position).toBeGreaterThanOrEqual(0);
        expect(chunk.heading_path).toBeDefined();
        expect(chunk.chunk_type).toBeDefined();
        expect(chunk.metadata.source_file_id).toBe('file-456');
        expect(chunk.metadata.source_file_name).toBe('test-document.md');
        expect(chunk.metadata.chunking_method).toBeDefined();
      });
    });

    test('should respect section boundaries when configured', async () => {
      const content = `# Section A
This is content for section A that should stay together.

# Section B
This is content for section B that should be in a separate chunk.

# Section C
This is content for section C.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'sections.md',
        {
          ...defaultConfig,
          respect_section_boundaries: true
        }
      );

      // Each major section should be in separate chunks or chunk groups
      const sectionAChunks = result.chunks.filter(chunk =>
        chunk.content.includes('Section A') || chunk.heading_path.some(h => h.includes('Section A'))
      );
      const sectionBChunks = result.chunks.filter(chunk =>
        chunk.content.includes('Section B') || chunk.heading_path.some(h => h.includes('Section B'))
      );

      expect(sectionAChunks.length).toBeGreaterThan(0);
      expect(sectionBChunks.length).toBeGreaterThan(0);

      // Sections should not be mixed in chunks
      result.chunks.forEach(chunk => {
        const hasA = chunk.content.includes('Section A');
        const hasB = chunk.content.includes('Section B');
        const hasC = chunk.content.includes('Section C');

        // A chunk should not contain content from multiple major sections
        expect([hasA, hasB, hasC].filter(Boolean).length).toBeLessThanOrEqual(1);
      });
    });

    test('should add overlaps between chunks when configured', async () => {
      const content = `# Document with Multiple Sections

## Section 1
This is the first section with substantial content that will likely be split across multiple chunks due to its length and complexity.

The first section continues with more detailed information that provides context and background for understanding the subsequent sections.

## Section 2
This is the second section that builds upon the previous section and introduces new concepts and methodologies.

The second section provides additional depth and analysis that extends the discussion from the first section.

## Section 3
This is the third section that synthesizes information from previous sections and draws conclusions.

The final section wraps up the discussion with summary and future directions.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'overlap-test.md',
        {
          ...defaultConfig,
          overlap_percentage: 15
        }
      );

      // Check that overlaps are created
      const chunksWithOverlap = result.chunks.filter(chunk =>
        chunk.has_overlap_next || chunk.has_overlap_previous
      );

      expect(chunksWithOverlap.length).toBeGreaterThan(0);

      // Check overlap relationships
      for (let i = 0; i < result.chunks.length - 1; i++) {
        const currentChunk = result.chunks[i];
        const nextChunk = result.chunks[i + 1];

        if (currentChunk.has_overlap_next) {
          expect(currentChunk.overlap_text).toBeDefined();
          expect(nextChunk.has_overlap_previous).toBe(true);
        }
      }
    });

    test('should handle different chunk types correctly', async () => {
      const content = `# Mixed Content Document

## Text Section
This is a regular text paragraph with narrative content.

## List Section
Here are some important points:

- First important point
- Second important point
- Third important point

## Table Section

| Column A | Column B | Column C |
|----------|----------|----------|
| Value 1  | Value 2  | Value 3  |
| Value 4  | Value 5  | Value 6  |

## Code Section

\`\`\`javascript
function example() {
  console.log("This is example code");
  return true;
}
\`\`\`

Text content after the code block.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'mixed-content.md',
        defaultConfig
      );

      // Check that different chunk types are identified
      const chunkTypes = new Set(result.chunks.map(chunk => chunk.chunk_type));
      expect(chunkTypes.size).toBeGreaterThan(1);

      // Verify specific content types are preserved
      const headingChunks = result.chunks.filter(chunk => chunk.chunk_type === 'heading');
      const listChunks = result.chunks.filter(chunk => chunk.chunk_type === 'list');
      const tableChunks = result.chunks.filter(chunk => chunk.chunk_type === 'table');

      expect(headingChunks.length).toBeGreaterThan(0);

      // Verify list chunks contain list content
      if (listChunks.length > 0) {
        listChunks.forEach(chunk => {
          expect(chunk.content).toMatch(/[•\-\*]|^\d+\./);
        });
      }

      // Check that atomic content (tables, code) is preserved
      if (tableChunks.length > 0) {
        tableChunks.forEach(chunk => {
          expect(chunk.content).toContain('|');
        });
      }
    });

    test('should maintain hierarchy relationships', async () => {
      const content = `# Main Document

## Chapter 1: Introduction
This is the introduction chapter.

### 1.1 Overview
Overview of the topic.

### 1.2 Objectives
Main objectives of this work.

## Chapter 2: Methodology
This is the methodology chapter.

### 2.1 Approach
Our methodological approach.

#### 2.1.1 Step One
First step of the approach.

#### 2.1.2 Step Two
Second step of the approach.

### 2.2 Tools
Tools used in this methodology.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'hierarchy-test.md',
        defaultConfig
      );

      // Check hierarchy levels are preserved
      const hierarchyLevels = new Set(result.chunks.map(chunk => chunk.hierarchy_level));
      expect(hierarchyLevels.size).toBeGreaterThan(1);

      // Check heading paths are constructed correctly
      result.chunks.forEach(chunk => {
        if (chunk.hierarchy_level > 0) {
          expect(chunk.heading_path).toBeDefined();
          expect(Array.isArray(chunk.heading_path)).toBe(true);
        }
      });

      // Check that deeper sections have longer paths
      const deepestChunks = result.chunks.filter(chunk => chunk.hierarchy_level >= 3);
      if (deepestChunks.length > 0) {
        deepestChunks.forEach(chunk => {
          expect(chunk.heading_path.length).toBeGreaterThan(0);
        });
      }
    });

    test('should handle large documents with multiple split strategies', async () => {
      // Generate a large document that will require splitting
      const largeSections = Array.from({ length: 5 }, (_, i) => `
## Section ${i + 1}
This is section ${i + 1} with substantial content that includes multiple paragraphs and detailed explanations.

### Subsection ${i + 1}.1
This subsection provides in-depth analysis and discussion of various topics related to section ${i + 1}.

The content continues with more detailed explanations and examples that demonstrate the concepts being discussed.

Additional paragraphs provide further context and background information that readers need to understand the full scope of the topic.

### Subsection ${i + 1}.2
This is another subsection that explores different aspects of the main topic in section ${i + 1}.

Here we dive deeper into specific methodologies and approaches that are relevant to this particular area of study.

The discussion includes practical examples and case studies that illustrate the principles in action.
`).join('\n');

      const content = `# Large Document for Testing\n\n${largeSections}`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'large-document.md',
        defaultConfig
      );

      expect(result.chunks.length).toBeGreaterThan(5);
      expect(result.total_tokens).toBeGreaterThan(1000);

      // Check that chunks don't exceed max size
      result.chunks.forEach(chunk => {
        expect(chunk.tokens).toBeLessThanOrEqual(defaultConfig.max_chunk_size);
      });

      // Check that chunks maintain logical order
      for (let i = 1; i < result.chunks.length; i++) {
        expect(result.chunks[i].position).toBeGreaterThan(result.chunks[i - 1].position);
      }
    });

    test('should handle edge cases gracefully', async () => {
      // Very short document
      const shortContent = "# Short\nJust a bit of content.";
      const shortResult = await chunker.chunkDocument(
        shortContent,
        'doc-short',
        'file-short',
        'short.md',
        defaultConfig
      );

      expect(shortResult.chunks.length).toBeGreaterThan(0);
      expect(shortResult.chunks[0].content).toContain('Short');

      // Document with only headings
      const headingsOnly = `# Heading 1\n## Heading 2\n### Heading 3`;
      const headingsResult = await chunker.chunkDocument(
        headingsOnly,
        'doc-headings',
        'file-headings',
        'headings.md',
        defaultConfig
      );

      expect(headingsResult.chunks.length).toBeGreaterThan(0);

      // Document with very long single paragraph
      const longParagraph = `# Long Paragraph\n${'This is a very long sentence that repeats itself many times. '.repeat(100)}`;
      const longResult = await chunker.chunkDocument(
        longParagraph,
        'doc-long',
        'file-long',
        'long.md',
        defaultConfig
      );

      expect(longResult.chunks.length).toBeGreaterThan(1);
    });

    test('should calculate quality metrics correctly', async () => {
      const content = `# Quality Test Document

## Well-Structured Section
This section has good structure and coherent content that flows logically from one point to the next.

The content maintains thematic consistency and provides clear explanations throughout.

## Another Good Section
This section also maintains good quality with related content and clear organization.

All content here relates to the main theme and provides valuable information.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'quality-test.md',
        defaultConfig
      );

      expect(result.semantic_coherence).toBeGreaterThanOrEqual(0);
      expect(result.semantic_coherence).toBeLessThanOrEqual(1);
      expect(result.hierarchy_preservation).toBeGreaterThanOrEqual(0);
      expect(result.hierarchy_preservation).toBeLessThanOrEqual(1);
      expect(result.overlap_efficiency).toBeGreaterThanOrEqual(0);
      expect(result.overlap_efficiency).toBeLessThanOrEqual(1);

      // Check chunk-level quality metrics
      result.chunks.forEach(chunk => {
        expect(chunk.semantic_density).toBeGreaterThanOrEqual(0);
        expect(chunk.semantic_density).toBeLessThanOrEqual(1);
        expect(chunk.topic_keywords).toBeDefined();
        expect(Array.isArray(chunk.topic_keywords)).toBe(true);
      });
    });
  });

  describe('configuration options', () => {
    test('should respect minimum chunk size', async () => {
      const content = `# Test Document\nShort content that should be padded or combined.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'min-size-test.md',
        {
          min_chunk_size: 200,
          max_chunk_size: 500,
          target_chunk_size: 300,
          overlap_percentage: 0,
          prefer_semantic_boundaries: false,
          respect_section_boundaries: false,
          include_heading_context: true
        }
      );

      result.chunks.forEach(chunk => {
        expect(chunk.tokens).toBeGreaterThanOrEqual(200);
      });
    });

    test('should disable semantic boundaries when configured', async () => {
      const content = `# Document Title

## Section A
Content for section A that might normally be split semantically.

Topic shift here with different content that would normally trigger a semantic boundary.

## Section B
Different topic content that should be handled structurally only.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'no-semantic.md',
        {
          min_chunk_size: 100,
          max_chunk_size: 500,
          target_chunk_size: 300,
          overlap_percentage: 0,
          prefer_semantic_boundaries: false,
          respect_section_boundaries: true,
          include_heading_context: true
        }
      );

      // Should still create valid chunks but without semantic optimization
      expect(result.chunks.length).toBeGreaterThan(0);
      result.chunks.forEach(chunk => {
        expect(chunk.metadata.chunking_method).toBeDefined();
      });
    });

    test('should exclude heading context when configured', async () => {
      const content = `# Main Title

## Subsection Title
Content under the subsection that should not include heading context.

### Deep Section
More content at a deeper level.`;

      const result = await chunker.chunkDocument(
        content,
        'doc-123',
        'file-456',
        'no-context.md',
        {
          min_chunk_size: 50,
          max_chunk_size: 200,
          target_chunk_size: 100,
          overlap_percentage: 0,
          prefer_semantic_boundaries: false,
          respect_section_boundaries: false,
          include_heading_context: false
        }
      );

      expect(result.chunks.length).toBeGreaterThan(0);

      // Non-heading chunks should have minimal heading path when context is disabled
      const contentChunks = result.chunks.filter(chunk => chunk.chunk_type !== 'heading');
      contentChunks.forEach(chunk => {
        expect(chunk.heading_path).toBeDefined();
      });
    });
  });
});