'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, FileText, Hash, Layers, Tag, Clock } from 'lucide-react';

interface ChunkData {
  id: string;
  content: string;
  tokens: number;
  position: number;
  heading_path: string[];
  hierarchy_level: number;
  chunk_type: string;
  semantic_density: number;
  topic_keywords: string[];
  has_overlap_previous: boolean;
  has_overlap_next: boolean;
  overlap_text?: string;
  chunking_method: string;
  created_at: string;
}

interface ChunkingResult {
  chunks: ChunkData[];
  total_chunks: number;
  total_tokens: number;
  average_chunk_size: number;
  semantic_coherence: number;
  hierarchy_preservation: number;
  overlap_efficiency: number;
}

export default function ChunkTestPage() {
  const [inputText, setInputText] = useState('');
  const [result, setResult] = useState<ChunkingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processText = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text to process');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/test/chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: inputText,
          config: {
            min_chunk_size: 100,
            max_chunk_size: 500,
            target_chunk_size: 300,
            overlap_percentage: 10,
            prefer_semantic_boundaries: true,
            respect_section_boundaries: true,
            include_heading_context: true
          }
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getChunkTypeColor = (type: string) => {
    const colors = {
      heading: 'bg-blue-100 text-blue-800',
      paragraph: 'bg-gray-100 text-gray-800',
      list: 'bg-green-100 text-green-800',
      table: 'bg-purple-100 text-purple-800',
      code: 'bg-orange-100 text-orange-800',
      mixed: 'bg-yellow-100 text-yellow-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const sampleText = `# Semantic Chunking Documentation

## Introduction
This document explains how semantic chunking works in our system. It combines structural analysis with semantic understanding to create meaningful text segments.

### Key Features
Our semantic chunking system provides:

- Hierarchical document parsing
- Semantic boundary detection
- Configurable chunk sizes
- Overlap management
- Context preservation

### Technical Implementation

#### Document Structure Parser
The parser analyzes document structure including:

1. Heading hierarchy (H1-H6)
2. Paragraph boundaries
3. List structures
4. Table content
5. Code blocks

#### Semantic Analysis
We use embedding similarity to detect:

- Topic shifts between sections
- Semantic coherence within chunks
- Natural language boundaries
- Context relationships

## Configuration Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| min_chunk_size | 100 | Minimum tokens per chunk |
| max_chunk_size | 500 | Maximum tokens per chunk |
| target_chunk_size | 300 | Preferred chunk size |
| overlap_percentage | 10 | Overlap between chunks |

## Example Usage

\`\`\`typescript
const chunker = new SemanticChunker();
const result = await chunker.chunkDocument(
  content,
  documentId,
  sourceFileId,
  fileName,
  config
);
\`\`\`

The result contains chunks with metadata including hierarchy paths, semantic density, and topic keywords.

## Best Practices

### Content Preparation
Ensure your content has:

- Clear heading structure
- Logical flow between sections
- Consistent formatting
- Appropriate length for chunking

### Configuration Tuning
Adjust parameters based on:

- Document type and length
- Intended use case
- Processing requirements
- Quality vs. performance trade-offs

This system is designed to handle various document types while maintaining semantic coherence and structural integrity.`;

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Semantic Chunking Test</h1>
        <p className="text-gray-600">
          Test the semantic chunking system by pasting text content below and seeing how it gets processed into chunks.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Input Text
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste your text content here..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={20}
                className="resize-none"
              />

              <div className="flex gap-2">
                <Button
                  onClick={processText}
                  disabled={loading || !inputText.trim()}
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Process Text'
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setInputText(sampleText)}
                >
                  Load Sample
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setInputText('');
                    setResult(null);
                    setError(null);
                  }}
                >
                  Clear
                </Button>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-800">{error}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {result && (
            <>
              {/* Summary Stats */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hash className="h-5 w-5" />
                    Processing Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{result.total_chunks}</div>
                      <div className="text-sm text-blue-800">Total Chunks</div>
                    </div>
                    <div className="text-center p-3 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{result.total_tokens}</div>
                      <div className="text-sm text-green-800">Total Tokens</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{Math.round(result.average_chunk_size)}</div>
                      <div className="text-sm text-purple-800">Avg Chunk Size</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{Math.round(result.semantic_coherence * 100)}%</div>
                      <div className="text-sm text-orange-800">Coherence</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Chunks Display */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5" />
                    Generated Chunks ({result.chunks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="max-h-96 overflow-y-auto space-y-4">
                    {result.chunks.map((chunk, index) => (
                      <div key={chunk.id} className="border rounded-lg p-4 space-y-3">
                        {/* Chunk Header */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">#{index + 1}</Badge>
                            <Badge className={getChunkTypeColor(chunk.chunk_type)}>
                              {chunk.chunk_type}
                            </Badge>
                            <span className="text-sm text-gray-500">
                              Level {chunk.hierarchy_level}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500">
                              {chunk.tokens} tokens
                            </span>
                            {chunk.has_overlap_previous && (
                              <Badge variant="secondary" className="text-xs">
                                ← Overlap
                              </Badge>
                            )}
                            {chunk.has_overlap_next && (
                              <Badge variant="secondary" className="text-xs">
                                Overlap →
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Heading Path */}
                        {chunk.heading_path.length > 0 && (
                          <div className="flex items-center gap-1 text-sm text-blue-600">
                            <Layers className="h-3 w-3" />
                            {chunk.heading_path.join(' > ')}
                          </div>
                        )}

                        {/* Content */}
                        <div className="bg-gray-50 rounded p-3">
                          <pre className="whitespace-pre-wrap text-sm">
                            {chunk.content}
                          </pre>
                        </div>

                        {/* Metadata */}
                        <div className="flex flex-wrap gap-2 items-center">
                          {chunk.topic_keywords.length > 0 && (
                            <div className="flex items-center gap-1">
                              <Tag className="h-3 w-3 text-gray-500" />
                              <div className="flex gap-1">
                                {chunk.topic_keywords.slice(0, 3).map((keyword) => (
                                  <Badge key={keyword} variant="outline" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            Density: {Math.round(chunk.semantic_density * 100)}%
                          </div>
                        </div>

                        {/* Overlap Text */}
                        {chunk.overlap_text && (
                          <details className="text-sm">
                            <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                              Show overlap text
                            </summary>
                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                              <pre className="whitespace-pre-wrap text-xs">
                                {chunk.overlap_text}
                              </pre>
                            </div>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!result && !loading && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Enter text above and click "Process Text" to see the chunking results</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}