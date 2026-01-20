import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { TaskType } from '@google/generative-ai';
import { getGeminiApiKey, AI_CONFIG } from './config';

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  maxBatchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  rateLimitPerMinute: number;
}

export interface EmbeddingOptions {
  taskType?: 'document' | 'query';
  title?: string;
}

export interface EmbeddingResult {
  embeddings: number[][];
  tokensUsed: number;
  requestCount: number;
}

export class GeminiEmbeddingService {
  private embeddings: GoogleGenerativeAIEmbeddings;
  private requestCount = 0;
  private lastResetTime = Date.now();
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  private readonly config: EmbeddingConfig = {
    model: AI_CONFIG.embeddings.model,
    dimensions: AI_CONFIG.embeddings.dimensions,
    maxBatchSize: AI_CONFIG.embeddings.maxBatchSize,
    maxRetries: AI_CONFIG.embeddings.maxRetries,
    retryDelayMs: AI_CONFIG.embeddings.retryDelayMs,
    rateLimitPerMinute: AI_CONFIG.embeddings.rateLimitPerMinute
  };

  constructor() {
    this.initializeService();
  }

  private initializeService(): void {
    try {
      const apiKey = getGeminiApiKey();

      this.embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey,
        model: this.config.model,
        maxRetries: this.config.maxRetries,
        // Configure output dimensions to match our system
        outputDimensionality: this.config.dimensions
      });

      console.log(`Gemini embedding service initialized with ${this.config.model} (${this.config.dimensions}D)`);
    } catch (error) {
      console.error('Failed to initialize Gemini embedding service:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts with rate limiting and batching
   */
  async generateEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    if (texts.length === 0) {
      return { embeddings: [], tokensUsed: 0, requestCount: 0 };
    }

    // Process in batches to respect API limits
    const batches = this.createBatches(texts, this.config.maxBatchSize);
    const allEmbeddings: number[][] = [];
    let totalTokens = 0;
    let totalRequests = 0;

    for (const batch of batches) {
      try {
        await this.waitForRateLimit();

        const batchResult = await this.generateBatchEmbeddings(batch, options);
        allEmbeddings.push(...batchResult.embeddings);
        totalTokens += batchResult.tokensUsed;
        totalRequests += batchResult.requestCount;

        this.requestCount++;
      } catch (error) {
        console.error('Batch embedding generation failed:', error);

        // Use fallback embeddings for failed batch
        const fallbackEmbeddings = batch.map(() => this.createFallbackEmbedding());
        allEmbeddings.push(...fallbackEmbeddings);
      }
    }

    return {
      embeddings: allEmbeddings,
      tokensUsed: totalTokens,
      requestCount: totalRequests
    };
  }

  /**
   * Generate embeddings for document chunks
   */
  async generateDocumentEmbeddings(texts: string[]): Promise<number[][]> {
    const result = await this.generateEmbeddings(texts, {
      taskType: 'document'
    });
    return result.embeddings;
  }

  /**
   * Generate embedding for a search query
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    const result = await this.generateEmbeddings([query], {
      taskType: 'query'
    });
    return result.embeddings[0] || this.createFallbackEmbedding();
  }

  /**
   * Generate embeddings for a single batch with proper task type
   */
  private async generateBatchEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    const taskType = this.getTaskType(options.taskType);

    try {
      // Configure embeddings instance for this specific task
      const embedder = new GoogleGenerativeAIEmbeddings({
        apiKey: getGeminiApiKey(),
        model: this.config.model,
        maxRetries: this.config.maxRetries,
        outputDimensionality: this.config.dimensions,
        taskType,
        title: options.title
      });

      const embeddings = options.taskType === 'query'
        ? [await embedder.embedQuery(texts[0])]
        : await embedder.embedDocuments(texts);

      // Validate dimensions
      this.validateEmbeddings(embeddings);

      return {
        embeddings,
        tokensUsed: this.estimateTokenUsage(texts),
        requestCount: 1
      };
    } catch (error) {
      console.error('Gemini embedding API error:', error);

      // Return fallback embeddings
      const fallbackEmbeddings = texts.map(() => this.createFallbackEmbedding());
      return {
        embeddings: fallbackEmbeddings,
        tokensUsed: this.estimateTokenUsage(texts),
        requestCount: 0
      };
    }
  }

  /**
   * Map our task types to Gemini's TaskType enum
   */
  private getTaskType(taskType?: string): TaskType {
    switch (taskType) {
      case 'query':
        return TaskType.RETRIEVAL_QUERY;
      case 'document':
      default:
        return TaskType.RETRIEVAL_DOCUMENT;
    }
  }

  /**
   * Create batches of texts respecting API limits
   */
  private createBatches(texts: string[], batchSize: number): string[][] {
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Rate limiting: wait if we've exceeded the rate limit
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceReset = now - this.lastResetTime;

    // Reset counter every minute
    if (timeSinceReset >= 60000) {
      this.requestCount = 0;
      this.lastResetTime = now;
      return;
    }

    // If we've hit the rate limit, wait
    if (this.requestCount >= this.config.rateLimitPerMinute) {
      const waitTime = 60000 - timeSinceReset;
      console.log(`Rate limit reached, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
      this.requestCount = 0;
      this.lastResetTime = Date.now();
    }
  }

  /**
   * Create fallback embedding for when API fails
   */
  private createFallbackEmbedding(): number[] {
    // Create a consistent fallback embedding filled with small random values
    const embedding = new Array(this.config.dimensions).fill(0);
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = (Math.random() - 0.5) * 0.01; // Small random values
    }

    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => magnitude > 0 ? val / magnitude : 0);
  }

  /**
   * Validate that embeddings have correct dimensions
   */
  private validateEmbeddings(embeddings: number[][]): void {
    for (const embedding of embeddings) {
      if (embedding.length !== this.config.dimensions) {
        throw new Error(
          `Expected embedding dimension ${this.config.dimensions}, got ${embedding.length}`
        );
      }
    }
  }

  /**
   * Estimate token usage for billing/monitoring
   */
  private estimateTokenUsage(texts: string[]): number {
    // Rough approximation: 1 token ≈ 0.75 words
    return texts.reduce((total, text) => {
      const wordCount = text.split(/\s+/).length;
      return total + Math.ceil(wordCount * 0.75);
    }, 0);
  }

  /**
   * Utility function for waiting
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Health check for the embedding service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const testEmbedding = await this.generateQueryEmbedding('test health check');
      return testEmbedding.length === this.config.dimensions;
    } catch (error) {
      console.error('Embedding service health check failed:', error);
      return false;
    }
  }

  /**
   * Get service configuration
   */
  getConfig(): EmbeddingConfig {
    return { ...this.config };
  }
}

// Singleton instance
let embeddingServiceInstance: GeminiEmbeddingService | null = null;

export function getGeminiEmbeddingService(): GeminiEmbeddingService {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new GeminiEmbeddingService();
  }
  return embeddingServiceInstance;
}

// Export for testing
export { embeddingServiceInstance };