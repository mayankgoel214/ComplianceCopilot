'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Loader2, Search, Target, Zap, Database, Clock, Layers, Tag } from 'lucide-react';

interface SearchChunk {
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
}

interface EmbedTestResult {
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
    strategy_used: string;
    total_results: number;
    search_time_ms: number;
    chunks: SearchChunk[];
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

export default function EmbedTestPage() {
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [result, setResult] = useState<EmbedTestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Configuration state
  const [chunkSize, setChunkSize] = useState(300);
  const [maxResults, setMaxResults] = useState(5);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.3);
  const [strategy, setStrategy] = useState('semantic');

  const processText = async () => {
    if (!inputText.trim()) {
      setError('Please enter some text content to process');
      return;
    }

    if (!searchQuery.trim()) {
      setError('Please enter a search query');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/test/embed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: inputText,
          query: searchQuery,
          config: {
            min_chunk_size: Math.max(50, chunkSize - 100),
            max_chunk_size: chunkSize + 200,
            target_chunk_size: chunkSize,
            overlap_percentage: 10,
            prefer_semantic_boundaries: true,
            respect_section_boundaries: true,
            include_heading_context: true
          },
          retrieval: {
            strategy: strategy,
            max_results: maxResults,
            similarity_threshold: similarityThreshold
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || `HTTP error! status: ${response.status}`);
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

  const getSimilarityColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800';
    if (score >= 0.4) return 'bg-orange-100 text-orange-800';
    return 'bg-red-100 text-red-800';
  };

  const sampleContent = `# AI Safety Guidelines

## Introduction
AI safety ensures that artificial intelligence systems operate safely and beneficially for humanity. This field focuses on technical and policy measures to prevent harmful outcomes from AI systems.

## Core Safety Principles

### Alignment
AI systems should be aligned with human values and intentions, pursuing goals that humans actually want achieved rather than optimizing for proxy objectives.

### Robustness
AI systems should be robust and reliable, continuing to operate safely even in unexpected situations or edge cases that weren't anticipated during training.

### Interpretability
AI systems should be interpretable and explainable, allowing humans to understand their decision-making processes and detect potential issues.

## Risk Assessment

### Capability Assessment
Regularly assess the capabilities of AI systems and their potential for causing harm. This includes understanding both current abilities and potential future capabilities.

### Impact Analysis
Analyze the potential positive and negative impacts of AI deployment on society, individuals, and organizations. Consider both direct and indirect effects.

### Mitigation Strategies
Develop and implement strategies to mitigate identified risks and prevent harmful outcomes. This includes technical safeguards and governance measures.

## Governance Framework

### Oversight Mechanisms
Establish clear oversight mechanisms with human judgment remaining central to critical decisions. No AI system should operate without appropriate human supervision.

### Continuous Monitoring
Implement continuous monitoring systems to detect and respond to potential safety issues in real-time during AI system operation.

### Stakeholder Engagement
Engage with diverse stakeholders including ethicists, policymakers, affected communities, and domain experts to ensure comprehensive safety considerations.

## Technical Safeguards

### Testing and Validation
Implement comprehensive testing protocols including red team exercises, stress testing, and validation against safety criteria before deployment.

### Fail-Safe Mechanisms
Design systems with fail-safe mechanisms that default to safe behavior when encountering unexpected situations or system failures.

### Gradual Deployment
Use gradual deployment strategies with careful monitoring at each stage to identify and address safety issues before full-scale deployment.`;

  const sampleQueries = [
    "What is AI alignment?",
    "How do we assess AI risks?",
    "What governance mechanisms are needed?",
    "Why is interpretability important?",
    "What are technical safeguards for AI?"
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Semantic Search Test</h1>
        <p className="text-gray-600">
          Test the complete semantic search pipeline: chunking, embedding generation, vector storage, and similarity search.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Section */}
        <div className="lg:col-span-2 space-y-4">
          {/* Content Input */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Content to Index
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Paste your document content here..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                rows={15}
                className="resize-none"
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setInputText(sampleContent)}
                  size="sm"
                >
                  Load Sample Content
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setInputText('')}
                  size="sm"
                >
                  Clear Content
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Search Query */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search Query
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="What would you like to search for?"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />

              <div className="flex flex-wrap gap-2">
                <Label className="text-sm text-gray-600">Quick examples:</Label>
                {sampleQueries.map((query) => (
                  <Button
                    key={query}
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery(query)}
                    className="text-xs"
                  >
                    {query}
                  </Button>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={processText}
                  disabled={loading || !inputText.trim() || !searchQuery.trim()}
                  className="flex items-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Run Search
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    setInputText('');
                    setSearchQuery('');
                    setResult(null);
                    setError(null);
                  }}
                >
                  Clear All
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

        {/* Configuration Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Search Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Strategy Selection */}
              <div className="space-y-2">
                <Label>Retrieval Strategy</Label>
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="semantic">Semantic</option>
                  <option value="hierarchical">Hierarchical</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="contextual">Contextual</option>
                  <option value="keyword">Keyword</option>
                </select>
              </div>

              {/* Max Results */}
              <div className="space-y-2">
                <Label>Max Results: {maxResults}</Label>
                <input
                  type="range"
                  value={maxResults}
                  onChange={(e) => setMaxResults(Number(e.target.value))}
                  min={1}
                  max={20}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Similarity Threshold */}
              <div className="space-y-2">
                <Label>Similarity Threshold: {similarityThreshold.toFixed(2)}</Label>
                <input
                  type="range"
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                  min={0.1}
                  max={0.9}
                  step={0.05}
                  className="w-full"
                />
              </div>

              {/* Chunk Size */}
              <div className="space-y-2">
                <Label>Target Chunk Size: {chunkSize} tokens</Label>
                <input
                  type="range"
                  value={chunkSize}
                  onChange={(e) => setChunkSize(Number(e.target.value))}
                  min={100}
                  max={800}
                  step={50}
                  className="w-full"
                />
              </div>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          {result && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="font-mono">{result.performance.total_time_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Chunking:</span>
                    <span className="font-mono">{result.performance.chunking_time_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Embedding:</span>
                    <span className="font-mono">{result.performance.embedding_time_ms}ms</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Search:</span>
                    <span className="font-mono">{result.performance.search_time_ms}ms</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>API Calls:</span>
                    <span className="font-mono">{result.metadata.embeddings_api_calls}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tokens Used:</span>
                    <span className="font-mono">{result.metadata.tokens_used}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="mt-8 space-y-6">
          {/* Summary Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Search Results for: "{result.search_results.query}"
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{result.search_results.total_results}</div>
                  <div className="text-sm text-blue-800">Results Found</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{result.input_stats.total_chunks_created}</div>
                  <div className="text-sm text-green-800">Total Chunks</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{result.search_results.strategy_used}</div>
                  <div className="text-sm text-purple-800">Strategy Used</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{Math.round(result.input_stats.average_chunk_size)}</div>
                  <div className="text-sm text-orange-800">Avg Chunk Size</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Search Results */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Ranked Results ({result.search_results.chunks.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {result.search_results.chunks.map((chunk, index) => (
                  <div key={chunk.id} className="border rounded-lg p-4 space-y-3">
                    {/* Result Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">#{index + 1}</Badge>
                        <Badge className={getSimilarityColor(chunk.similarity_score)}>
                          {(chunk.similarity_score * 100).toFixed(1)}% match
                        </Badge>
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
                        <span className="text-xs text-gray-400 font-mono">
                          distance: {chunk.distance.toFixed(3)}
                        </span>
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

                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        Position: {chunk.position}
                      </div>
                    </div>
                  </div>
                ))}

                {result.search_results.chunks.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No chunks found above the similarity threshold.</p>
                    <p className="text-sm">Try lowering the similarity threshold or rephrasing your query.</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!result && !loading && (
        <div className="mt-8">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-gray-500">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Enter content and a search query above, then click "Run Search" to test semantic search</p>
                <p className="text-sm mt-2">This will chunk your content, generate embeddings, and find the most relevant passages</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}