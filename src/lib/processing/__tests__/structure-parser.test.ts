import { DocumentStructureParser } from '../structure-parser';

describe('DocumentStructureParser', () => {
  let parser: DocumentStructureParser;

  beforeEach(() => {
    parser = new DocumentStructureParser();
  });

  describe('parseDocument', () => {
    test('should parse markdown headings correctly', () => {
      const content = `# Introduction
This is the introduction section.

## Background
Some background information.

### Technical Details
More specific technical information.

## Methodology
Description of the methodology.`;

      const structure = parser.parseDocument(content);

      expect(structure.nodes).toHaveLength(5);
      expect(structure.root_nodes).toHaveLength(1);

      // Check main heading
      const intro = structure.nodes[0];
      expect(intro.type).toBe('heading');
      expect(intro.level).toBe(1);
      expect(intro.content).toBe('Introduction');
      expect(intro.children_ids).toHaveLength(2); // Background section and its content
    });

    test('should parse numbered headings correctly', () => {
      const content = `1. Executive Summary
This document provides an overview.

1.1. Purpose
The purpose of this document.

1.2. Scope
The scope includes various aspects.

2. Technical Specifications
Detailed technical information.

2.1. Architecture
System architecture details.`;

      const structure = parser.parseDocument(content);

      const headings = structure.nodes.filter(node => node.type === 'heading');
      expect(headings).toHaveLength(5);

      // Check level structure
      expect(headings[0].level).toBe(1); // "1. Executive Summary"
      expect(headings[1].level).toBe(2); // "1.1. Purpose"
      expect(headings[2].level).toBe(2); // "1.2. Scope"
      expect(headings[3].level).toBe(1); // "2. Technical Specifications"
      expect(headings[4].level).toBe(2); // "2.1. Architecture"

      // Check parent-child relationships
      expect(headings[1].parent_id).toBe(headings[0].id);
      expect(headings[2].parent_id).toBe(headings[0].id);
      expect(headings[4].parent_id).toBe(headings[3].id);
    });

    test('should parse list items correctly', () => {
      const content = `# Requirements
The following requirements must be met:

- Performance requirements
- Security requirements
- Scalability requirements

1. Functional requirements
2. Non-functional requirements
3. Business requirements`;

      const structure = parser.parseDocument(content);

      const listNodes = structure.nodes.filter(node => node.type === 'list');
      expect(listNodes.length).toBeGreaterThan(0);

      // Check that list items are grouped
      const listContent = listNodes[0].content;
      expect(listContent).toContain('Performance requirements');
      expect(listContent).toContain('Security requirements');
      expect(listContent).toContain('Scalability requirements');
    });

    test('should parse table content correctly', () => {
      const content = `# Data Analysis

| Metric | Value | Status |
|--------|-------|---------|
| Performance | 95% | Good |
| Availability | 99.9% | Excellent |
| Security | 87% | Needs Improvement |

The table above shows key metrics.`;

      const structure = parser.parseDocument(content);

      const tableNodes = structure.nodes.filter(node => node.type === 'table');
      expect(tableNodes.length).toBeGreaterThan(0);

      const tableContent = tableNodes[0].content;
      expect(tableContent).toContain('| Metric | Value | Status |');
      expect(tableContent).toContain('| Performance | 95% | Good |');
    });

    test('should parse code blocks correctly', () => {
      const content = `# Implementation

Here's the main function:

\`\`\`javascript
function processData(input) {
  return input.map(item => item.value);
}
\`\`\`

And a simple example:

    const result = processData(data);
    console.log(result);`;

      const structure = parser.parseDocument(content);

      const codeNodes = structure.nodes.filter(node => node.type === 'code');
      expect(codeNodes.length).toBeGreaterThan(0);
    });

    test('should handle mixed content document', () => {
      const content = `# Project Documentation

## 1. Overview
This project implements a semantic chunking system.

### 1.1 Features
Key features include:

- Hierarchical document parsing
- Semantic boundary detection
- Vector storage with ChromaDB

### 1.2 Architecture

| Component | Purpose | Technology |
|-----------|---------|------------|
| Parser | Document structure extraction | TypeScript |
| Chunker | Semantic chunking | LangChain |
| Storage | Vector storage | ChromaDB |

## 2. Implementation

The main processing function:

\`\`\`typescript
async function processDocument(content: string): Promise<Chunks[]> {
  const structure = parseDocument(content);
  return await chunkDocument(structure);
}
\`\`\`

### 2.1 Configuration
Default configuration parameters:

- Chunk size: 400-500 tokens
- Overlap: 10%
- Similarity threshold: 0.7`;

      const structure = parser.parseDocument(content);

      // Verify different content types are parsed
      const headings = structure.nodes.filter(n => n.type === 'heading');
      const lists = structure.nodes.filter(n => n.type === 'list');
      const tables = structure.nodes.filter(n => n.type === 'table');
      const code = structure.nodes.filter(n => n.type === 'code');
      const paragraphs = structure.nodes.filter(n => n.type === 'paragraph');

      expect(headings.length).toBeGreaterThan(0);
      expect(lists.length).toBeGreaterThan(0);
      expect(tables.length).toBeGreaterThan(0);
      expect(code.length).toBeGreaterThan(0);
      expect(paragraphs.length).toBeGreaterThan(0);

      // Verify hierarchy relationships
      const level1Headings = headings.filter(h => h.level === 1);
      const level2Headings = headings.filter(h => h.level === 2);
      const level3Headings = headings.filter(h => h.level === 3);

      expect(level1Headings).toHaveLength(2);
      expect(level2Headings).toHaveLength(2);
      expect(level3Headings).toHaveLength(2);

      // Check that level 2 headings have level 1 parents
      level2Headings.forEach(heading => {
        expect(heading.parent_id).toBeDefined();
        const parent = structure.hierarchy_map.get(heading.parent_id!);
        expect(parent?.level).toBe(1);
      });
    });

    test('should handle empty and malformed content gracefully', () => {
      // Empty content
      const emptyStructure = parser.parseDocument('');
      expect(emptyStructure.nodes).toHaveLength(0);
      expect(emptyStructure.root_nodes).toHaveLength(0);

      // Only whitespace
      const whitespaceStructure = parser.parseDocument('   \n\n  \t  ');
      expect(whitespaceStructure.nodes).toHaveLength(0);

      // Malformed markdown
      const malformedContent = `### Missing level 1 and 2
Content under a level 3 heading without proper hierarchy.

#### Level 4 under level 3
This should still work.`;

      const malformedStructure = parser.parseDocument(malformedContent);
      expect(malformedStructure.nodes.length).toBeGreaterThan(0);

      const headings = malformedStructure.nodes.filter(n => n.type === 'heading');
      expect(headings).toHaveLength(2);
      expect(headings[0].level).toBe(3);
      expect(headings[1].level).toBe(4);
    });

    test('should preserve content order and position', () => {
      const content = `# First Section
First paragraph.

Second paragraph.

## Subsection
Subsection content.

# Second Section
Final content.`;

      const structure = parser.parseDocument(content);

      // Check that positions are sequential
      const positions = structure.nodes.map(node => node.position).sort((a, b) => a - b);
      expect(positions).toEqual([0, 1, 2, 3, 4, 5]);

      // Check that nodes are in logical order
      expect(structure.nodes[0].content).toBe('First Section');
      expect(structure.nodes[structure.nodes.length - 1].content).toBe('Final content.');
    });
  });

  describe('utility methods', () => {
    test('getNodesUnderHeading should return all child nodes', () => {
      const content = `# Main Section
Introduction text.

## Subsection A
Content A.

### Deep Section
Deep content.

## Subsection B
Content B.

# Another Section
Other content.`;

      const structure = parser.parseDocument(content);
      const mainHeading = structure.nodes.find(n => n.content === 'Main Section');
      expect(mainHeading).toBeDefined();

      const childNodes = parser.getNodesUnderHeading(structure, mainHeading!.id);

      // Should include both direct children and descendants
      expect(childNodes.length).toBeGreaterThan(2);

      // Should not include nodes from "Another Section"
      const otherSectionContent = childNodes.find(n => n.content === 'Other content.');
      expect(otherSectionContent).toBeUndefined();
    });

    test('getHeadingsAtLevel should filter headings correctly', () => {
      const content = `# Level 1 A
## Level 2 A
### Level 3 A
## Level 2 B
# Level 1 B
### Level 3 B`;

      const structure = parser.parseDocument(content);

      const level1Headings = parser.getHeadingsAtLevel(structure, 1);
      const level2Headings = parser.getHeadingsAtLevel(structure, 2);
      const level3Headings = parser.getHeadingsAtLevel(structure, 3);

      expect(level1Headings).toHaveLength(2);
      expect(level2Headings).toHaveLength(2);
      expect(level3Headings).toHaveLength(2);

      expect(level1Headings.map(h => h.content)).toEqual(['Level 1 A', 'Level 1 B']);
      expect(level2Headings.map(h => h.content)).toEqual(['Level 2 A', 'Level 2 B']);
    });

    test('structureToText should reconstruct readable text', () => {
      const content = `# Introduction
Welcome to the documentation.

## Getting Started
Follow these steps to begin.`;

      const structure = parser.parseDocument(content);
      const reconstructed = parser.structureToText(structure);

      expect(reconstructed).toContain('# Introduction');
      expect(reconstructed).toContain('## Getting Started');
      expect(reconstructed).toContain('Welcome to the documentation.');
      expect(reconstructed).toContain('Follow these steps to begin.');
    });
  });

  describe('complex document scenarios', () => {
    test('should handle technical documentation with code and tables', () => {
      const content = `# API Documentation

## Authentication
All API requests require authentication.

### API Key Authentication
Include your API key in the header:

\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" https://api.example.com/users
\`\`\`

## Endpoints

### Users Endpoint

| Method | Path | Description |
|--------|------|-------------|
| GET | /users | List all users |
| POST | /users | Create a user |
| GET | /users/:id | Get a specific user |

#### Example Request

\`\`\`json
{
  "name": "John Doe",
  "email": "john@example.com"
}
\`\`\`

#### Example Response

\`\`\`json
{
  "id": 123,
  "name": "John Doe",
  "email": "john@example.com",
  "created_at": "2024-01-01T00:00:00Z"
}
\`\`\`

## Error Handling
The API returns standard HTTP status codes.

### Error Response Format

| Status | Meaning | Response |
|--------|---------|----------|
| 400 | Bad Request | Validation errors |
| 401 | Unauthorized | Authentication required |
| 404 | Not Found | Resource not found |`;

      const structure = parser.parseDocument(content);

      // Should properly parse all elements
      const headings = structure.nodes.filter(n => n.type === 'heading');
      const code = structure.nodes.filter(n => n.type === 'code');
      const tables = structure.nodes.filter(n => n.type === 'table');

      expect(headings.length).toBeGreaterThan(5);
      expect(code.length).toBeGreaterThan(2);
      expect(tables.length).toBeGreaterThan(1);

      // Check hierarchy levels
      const level1 = headings.filter(h => h.level === 1);
      const level2 = headings.filter(h => h.level === 2);
      const level3 = headings.filter(h => h.level === 3);
      const level4 = headings.filter(h => h.level === 4);

      expect(level1.length).toBeGreaterThan(0);
      expect(level2.length).toBeGreaterThan(0);
      expect(level3.length).toBeGreaterThan(0);
      expect(level4.length).toBeGreaterThan(0);
    });

    test('should handle academic paper structure', () => {
      const content = `# Semantic Document Chunking: A Novel Approach

## Abstract
This paper presents a novel approach to semantic document chunking that combines structural and semantic analysis for improved information retrieval.

### Keywords
document processing, semantic analysis, information retrieval, natural language processing

## 1. Introduction
Traditional document processing approaches have limitations in understanding semantic boundaries.

### 1.1 Problem Statement
Current chunking methods rely primarily on fixed-size windows or structural markers.

### 1.2 Contributions
Our main contributions include:

1. A hybrid chunking algorithm combining structural and semantic analysis
2. Evaluation on diverse document types
3. Open-source implementation

## 2. Related Work

### 2.1 Traditional Chunking Methods
Previous approaches include:

- Fixed-size chunking
- Sentence-based chunking
- Paragraph-based chunking

### 2.2 Semantic Approaches
Recent work has explored semantic boundaries using:

- Sentence embeddings
- Topic modeling
- Neural coherence models

## 3. Methodology

### 3.1 Document Structure Analysis
We first parse the document to extract hierarchical structure.

### 3.2 Semantic Boundary Detection
Semantic boundaries are detected using embedding similarity analysis.

### 3.3 Hybrid Chunking Algorithm
The algorithm combines structural and semantic signals.

## 4. Experimental Results

### 4.1 Dataset
We evaluated on three document types:

| Type | Count | Avg Length |
|------|-------|------------|
| Technical | 50 | 2,500 words |
| Academic | 30 | 4,000 words |
| Legal | 20 | 6,000 words |

### 4.2 Metrics
Evaluation metrics include:

- Chunk coherence score
- Information preservation
- Retrieval accuracy

## 5. Conclusion
Our hybrid approach significantly improves chunking quality across diverse document types.

### 5.1 Future Work
Future research directions include:

- Multi-modal document support
- Real-time processing optimization
- Domain-specific customization

## References
[1] Smith, J. et al. "Document Chunking Methods." Journal of Information Science, 2023.
[2] Jones, A. "Semantic Text Analysis." ACL 2024.`;

      const structure = parser.parseDocument(content);

      // Verify academic paper structure
      const headings = structure.nodes.filter(n => n.type === 'heading');
      const lists = structure.nodes.filter(n => n.type === 'list');
      const tables = structure.nodes.filter(n => n.type === 'table');

      // Should have proper academic structure
      expect(headings.length).toBeGreaterThan(15);
      expect(lists.length).toBeGreaterThan(3);
      expect(tables.length).toBeGreaterThan(0);

      // Check for abstract, introduction, methodology, results, conclusion
      const headingTitles = headings.map(h => h.content.toLowerCase());
      expect(headingTitles.some(title => title.includes('abstract'))).toBe(true);
      expect(headingTitles.some(title => title.includes('introduction'))).toBe(true);
      expect(headingTitles.some(title => title.includes('methodology'))).toBe(true);
      expect(headingTitles.some(title => title.includes('result'))).toBe(true);
      expect(headingTitles.some(title => title.includes('conclusion'))).toBe(true);

      // Verify numbered sections are properly parsed
      const numberedSections = headings.filter(h => /^\d+\./.test(h.content));
      expect(numberedSections.length).toBeGreaterThan(4);
    });
  });
});