/**
 * Gemini's task-type values, inlined.
 *
 * They used to come from `@google/generative-ai`, pulled in transitively by the
 * LangChain wrapper this file stopped using. Three string constants are not
 * worth a dependency, and depending on a package that nothing else imports is
 * how a build breaks for a reason nobody can find.
 *
 * Asymmetric embedding matters here: a passage and a question about that
 * passage are not the same kind of text, and embedding both as RETRIEVAL_QUERY
 * measurably degrades retrieval.
 */
const TaskType = {
  RETRIEVAL_QUERY: 'RETRIEVAL_QUERY',
  RETRIEVAL_DOCUMENT: 'RETRIEVAL_DOCUMENT',
  SEMANTIC_SIMILARITY: 'SEMANTIC_SIMILARITY',
} as const;

type TaskType = (typeof TaskType)[keyof typeof TaskType];
import { getGeminiApiKey, AI_CONFIG } from './config';
import { getModelBaseUrl } from './endpoint';

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
      // Nothing to construct any more: embedding requests go straight to the
      // REST API, because the LangChain wrapper accepts outputDimensionality
      // and does not send it — which is what made every embedding come back at
      // 3072 dimensions instead of 768.
      //
      // The key is read here anyway, so that a missing one is a construction
      // failure rather than a failure on the first embedding call, several
      // seconds into a request the user is waiting on.
      getGeminiApiKey();

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
        // Rethrown rather than substituted. A synthetic vector in place of a
        // failed one is invisible: nothing errors, the index quietly fills with
        // noise, and every later search returns confident nonsense. A caller
        // that cannot embed needs to know it.
        console.error('Batch embedding generation failed:', error);
        throw error;
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
    const embedding = result.embeddings[0];
    if (!embedding) {
      throw new Error('Embedding request returned no vector for the query');
    }
    return embedding;
  }

  /**
   * Generate embeddings for a single batch with proper task type
   */
  private async generateBatchEmbeddings(
    texts: string[],
    options: EmbeddingOptions = {}
  ): Promise<EmbeddingResult> {
    const taskType = this.getTaskType(options.taskType);

    // Called directly rather than through GoogleGenerativeAIEmbeddings.
    //
    // That wrapper accepts an `outputDimensionality` option and, at the version
    // this project pins, does not implement it — the string does not appear
    // anywhere in the shipped package. Every request therefore came back at the
    // model's native 3072 dimensions, failed the 768 check below, and fell
    // through to the fallback path. The REST API honours the parameter.
    const embeddings = await this.embedViaRestApi(texts, taskType, options.title);

    this.validateEmbeddings(embeddings);

    return {
      embeddings,
      tokensUsed: this.estimateTokenUsage(texts),
      requestCount: 1
    };
  }

  /**
   * Embed a batch through the REST API.
   *
   * Errors propagate. There was previously a fallback here that returned
   * synthetic vectors when a request failed, which is the worst possible
   * behaviour for a retrieval system: the failure is invisible, the vectors are
   * meaningless, and every subsequent search returns confident nonsense drawn
   * from an index quietly filled with noise. A failed embedding must be a
   * failed embedding.
   */
  private async embedViaRestApi(
    texts: string[],
    taskType: TaskType,
    title?: string
  ): Promise<number[][]> {
    const endpoint = `${getModelBaseUrl()}/models/${this.config.model}:batchEmbedContents`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-goog-api-key': getGeminiApiKey(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${this.config.model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: this.config.dimensions,
          ...(title ? { title } : {})
        }))
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Embedding request failed (${response.status}): ${detail.slice(0, 300)}`
      );
    }

    const body = (await response.json()) as {
      embeddings?: Array<{ values: number[] }>;
    };

    if (!body.embeddings || body.embeddings.length !== texts.length) {
      throw new Error(
        `Embedding response mismatch: expected ${texts.length}, got ${body.embeddings?.length ?? 0}`
      );
    }

    return body.embeddings.map((e) => e.values);
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

  // createFallbackEmbedding used to live here. It returned a normalised vector
  // of small random numbers whenever a request failed — pure noise, shaped
  // exactly like a real embedding. Stored in the index it made retrieval return
  // confident nonsense while every log line said success. Deleted rather than
  // left unused, so it cannot be reached for again.

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