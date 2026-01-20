import { getGeminiService } from '../ai/gemini-service';
import { getGeminiEmbeddingService } from '../ai/gemini-embeddings';
import { AI_CONFIG } from '../ai/config';
import { HierarchyNode } from './structure-parser';

export interface SemanticSegment {
  id: string;
  start_position: number;
  end_position: number;
  content: string;
  coherence_score: number; // 0-1, higher = more coherent
  topic_keywords: string[];
  embedding?: number[]; // vector representation
  similarity_to_previous?: number; // similarity to previous segment
  similarity_to_next?: number; // similarity to next segment
}

export interface SemanticBoundary {
  position: number; // position between nodes
  boundary_strength: number; // 0-1, higher = stronger boundary
  similarity_drop: number; // how much similarity drops at this point
  topic_shift_detected: boolean;
  boundary_type: 'weak' | 'moderate' | 'strong';
}

export interface SemanticAnalysisResult {
  segments: SemanticSegment[];
  boundaries: SemanticBoundary[];
  overall_coherence: number;
  recommended_split_points: number[];
}

export class SemanticBoundaryDetector {
  private geminiService = getGeminiService();
  private embeddingService = getGeminiEmbeddingService();
  private readonly SIMILARITY_THRESHOLD = 0.7;
  private readonly WINDOW_SIZE = 3; // sentences to consider for context
  private readonly MIN_SEGMENT_SIZE = 100; // minimum tokens per segment

  /**
   * Analyze semantic boundaries in a sequence of hierarchy nodes
   */
  public async analyzeSemanticBoundaries(
    nodes: HierarchyNode[]
  ): Promise<SemanticAnalysisResult> {
    if (nodes.length === 0) {
      return {
        segments: [],
        boundaries: [],
        overall_coherence: 0,
        recommended_split_points: []
      };
    }

    // Convert nodes to text segments for analysis
    const textSegments = this.prepareTextSegments(nodes);

    // Generate embeddings for each segment
    const embeddings = await this.generateEmbeddings(textSegments);

    // Calculate similarities between adjacent segments
    const similarities = this.calculateSimilarities(embeddings);

    // Detect semantic boundaries
    const boundaries = this.detectBoundaries(similarities, textSegments);

    // Create semantic segments based on boundaries
    const segments = this.createSemanticSegments(textSegments, boundaries, embeddings);

    // Calculate overall coherence
    const overall_coherence = this.calculateOverallCoherence(similarities);

    // Recommend split points
    const recommended_split_points = this.recommendSplitPoints(boundaries, textSegments);

    return {
      segments,
      boundaries,
      overall_coherence,
      recommended_split_points
    };
  }

  /**
   * Prepare text segments from hierarchy nodes
   */
  private prepareTextSegments(nodes: HierarchyNode[]): string[] {
    return nodes
      .filter(node => node.content.trim().length > 0)
      .map(node => {
        // Include context from heading path for better semantic understanding
        const context = node.path.length > 0 ? `[${node.path.join(' > ')}] ` : '';
        return context + node.content;
      });
  }

  /**
   * Generate embeddings for text segments using Gemini
   */
  private async generateEmbeddings(segments: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches to avoid API limits
    const batchSize = 10;
    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      const batchEmbeddings = await this.generateBatchEmbeddings(batch);
      embeddings.push(...batchEmbeddings);
    }

    return embeddings;
  }

  /**
   * Generate embeddings for a batch of text segments using Gemini
   */
  private async generateBatchEmbeddings(segments: string[]): Promise<number[][]> {
    try {
      // Use real Gemini embedding service
      const embeddings = await this.embeddingService.generateDocumentEmbeddings(segments);
      return embeddings;
    } catch (error) {
      console.error('Error generating embeddings with Gemini service:', error);
      // Fall back to mock embeddings if Gemini API fails
      console.warn('Falling back to mock embeddings for semantic analysis');
      return segments.map(segment => this.createMockEmbedding(segment));
    }
  }

  /**
   * Create mock embedding based on text characteristics
   * In production, this would be replaced with actual Gemini embeddings
   */
  private createMockEmbedding(text: string): number[] {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(AI_CONFIG.embeddings.dimensions).fill(0); // Use configured embedding dimension

    // Create a simple hash-based embedding for testing
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const index = (word.charCodeAt(j) + i) % embedding.length;
        embedding[index] += 1 / (words.length + 1);
      }
    }

    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * Calculate cosine similarity between adjacent segments
   */
  private calculateSimilarities(embeddings: number[][]): number[] {
    const similarities: number[] = [];

    for (let i = 0; i < embeddings.length - 1; i++) {
      const similarity = this.cosineSimilarity(embeddings[i], embeddings[i + 1]);
      similarities.push(similarity);
    }

    return similarities;
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Detect semantic boundaries based on similarity patterns
   */
  private detectBoundaries(
    similarities: number[],
    textSegments: string[]
  ): SemanticBoundary[] {
    const boundaries: SemanticBoundary[] = [];

    for (let i = 0; i < similarities.length; i++) {
      const similarity = similarities[i];

      // Calculate local context for boundary strength
      const localWindow = this.getLocalSimilarityWindow(similarities, i);
      const averageLocal = localWindow.reduce((sum, val) => sum + val, 0) / localWindow.length;

      // Detect significant drops in similarity
      const similarityDrop = averageLocal - similarity;
      const boundaryStrength = Math.max(0, similarityDrop / averageLocal);

      // Classify boundary strength
      let boundaryType: 'weak' | 'moderate' | 'strong' = 'weak';
      if (similarity < this.SIMILARITY_THRESHOLD * 0.5) {
        boundaryType = 'strong';
      } else if (similarity < this.SIMILARITY_THRESHOLD) {
        boundaryType = 'moderate';
      }

      // Detect topic shifts using keywords
      const topicShift = this.detectTopicShift(
        textSegments[i],
        textSegments[i + 1]
      );

      boundaries.push({
        position: i + 1, // boundary is after position i
        boundary_strength: boundaryStrength,
        similarity_drop: similarityDrop,
        topic_shift_detected: topicShift,
        boundary_type: boundaryType
      });
    }

    return boundaries;
  }

  /**
   * Get local similarity window for context
   */
  private getLocalSimilarityWindow(similarities: number[], center: number): number[] {
    const start = Math.max(0, center - this.WINDOW_SIZE);
    const end = Math.min(similarities.length, center + this.WINDOW_SIZE + 1);
    return similarities.slice(start, end);
  }

  /**
   * Detect topic shift between two text segments using simple heuristics
   */
  private detectTopicShift(segment1: string, segment2: string): boolean {
    const keywords1 = this.extractKeywords(segment1);
    const keywords2 = this.extractKeywords(segment2);

    // Calculate keyword overlap
    const intersection = keywords1.filter(kw => keywords2.includes(kw));
    const union = [...new Set([...keywords1, ...keywords2])];

    const overlap = intersection.length / union.length;
    return overlap < 0.3; // Less than 30% keyword overlap suggests topic shift
  }

  /**
   * Extract keywords from text using simple frequency analysis
   */
  private extractKeywords(text: string): string[] {
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3); // Filter out short words

    // Count word frequencies
    const wordCounts = new Map<string, number>();
    words.forEach(word => {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    });

    // Return top keywords
    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(entry => entry[0]);
  }

  /**
   * Create semantic segments based on detected boundaries
   */
  private createSemanticSegments(
    textSegments: string[],
    boundaries: SemanticBoundary[],
    embeddings: number[][]
  ): SemanticSegment[] {
    const segments: SemanticSegment[] = [];
    let segmentStart = 0;

    // Find strong boundaries to use as segment breaks
    const strongBoundaries = boundaries
      .filter(boundary => boundary.boundary_type === 'strong' || boundary.boundary_type === 'moderate')
      .map(boundary => boundary.position);

    // Add final boundary
    strongBoundaries.push(textSegments.length);

    for (let i = 0; i < strongBoundaries.length; i++) {
      const segmentEnd = strongBoundaries[i];

      if (segmentEnd > segmentStart) {
        const segmentTexts = textSegments.slice(segmentStart, segmentEnd);
        const segmentContent = segmentTexts.join(' ');

        // Calculate average embedding for segment
        const segmentEmbeddings = embeddings.slice(segmentStart, segmentEnd);
        const avgEmbedding = this.averageEmbeddings(segmentEmbeddings);

        // Calculate coherence score
        const coherenceScore = this.calculateSegmentCoherence(segmentEmbeddings);

        // Extract keywords for segment
        const topicKeywords = this.extractKeywords(segmentContent);

        segments.push({
          id: `segment_${segments.length}`,
          start_position: segmentStart,
          end_position: segmentEnd,
          content: segmentContent,
          coherence_score: coherenceScore,
          topic_keywords: topicKeywords,
          embedding: avgEmbedding
        });

        segmentStart = segmentEnd;
      }
    }

    // Calculate similarities to adjacent segments
    this.calculateSegmentSimilarities(segments);

    return segments;
  }

  /**
   * Calculate average of multiple embeddings
   */
  private averageEmbeddings(embeddings: number[][]): number[] {
    if (embeddings.length === 0) return [];

    const dimension = embeddings[0].length;
    const avg = new Array(dimension).fill(0);

    embeddings.forEach(embedding => {
      embedding.forEach((value, index) => {
        avg[index] += value / embeddings.length;
      });
    });

    return avg;
  }

  /**
   * Calculate coherence score for a segment
   */
  private calculateSegmentCoherence(embeddings: number[][]): number {
    if (embeddings.length <= 1) return 1.0;

    let totalSimilarity = 0;
    let pairCount = 0;

    // Calculate average pairwise similarity within segment
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        totalSimilarity += this.cosineSimilarity(embeddings[i], embeddings[j]);
        pairCount++;
      }
    }

    return pairCount > 0 ? totalSimilarity / pairCount : 1.0;
  }

  /**
   * Calculate similarities between adjacent segments
   */
  private calculateSegmentSimilarities(segments: SemanticSegment[]): void {
    for (let i = 0; i < segments.length; i++) {
      const current = segments[i];

      if (i > 0 && current.embedding && segments[i - 1].embedding) {
        current.similarity_to_previous = this.cosineSimilarity(
          current.embedding,
          segments[i - 1].embedding!
        );
      }

      if (i < segments.length - 1 && current.embedding && segments[i + 1].embedding) {
        current.similarity_to_next = this.cosineSimilarity(
          current.embedding,
          segments[i + 1].embedding!
        );
      }
    }
  }

  /**
   * Calculate overall coherence of the document
   */
  private calculateOverallCoherence(similarities: number[]): number {
    if (similarities.length === 0) return 1.0;
    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

  /**
   * Recommend split points based on boundary analysis
   */
  private recommendSplitPoints(
    boundaries: SemanticBoundary[],
    textSegments: string[]
  ): number[] {
    const splitPoints: number[] = [];

    // Find boundaries that are good candidates for splitting
    boundaries
      .filter(boundary =>
        boundary.boundary_type === 'strong' ||
        (boundary.boundary_type === 'moderate' && boundary.topic_shift_detected)
      )
      .forEach(boundary => {
        // Check if the resulting segments would be large enough
        const estimatedTokens = this.estimateTokens(
          textSegments.slice(0, boundary.position).join(' ')
        );

        if (estimatedTokens >= this.MIN_SEGMENT_SIZE) {
          splitPoints.push(boundary.position);
        }
      });

    return splitPoints;
  }

  /**
   * Estimate token count for text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 0.75 words
    const wordCount = text.split(/\s+/).length;
    return Math.ceil(wordCount * 0.75);
  }

  /**
   * Analyze semantic similarity between two text chunks
   */
  public async analyzeSimilarity(text1: string, text2: string): Promise<number> {
    try {
      const embeddings = await this.embeddingService.generateDocumentEmbeddings([text1, text2]);

      if (embeddings.length >= 2) {
        return this.cosineSimilarity(embeddings[0], embeddings[1]);
      }

      return 0;
    } catch (error) {
      console.error('Error analyzing similarity:', error);
      // Fall back to mock similarity calculation
      const embedding1 = this.createMockEmbedding(text1);
      const embedding2 = this.createMockEmbedding(text2);
      return this.cosineSimilarity(embedding1, embedding2);
    }
  }
}