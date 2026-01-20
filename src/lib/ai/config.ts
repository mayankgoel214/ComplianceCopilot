export const AI_CONFIG = {
  gemini: {
    model: 'gemini-2.5-flash',
    temperature: 0.1,
    maxTokens: 8192,
    maxRetries: 3,
  },
  embeddings: {
    model: 'text-embedding-004',
    dimensions: 768, // Default dimension for text-embedding-004
    maxBatchSize: 100,
    rateLimitPerMinute: 60,
    maxRetries: 3,
    retryDelayMs: 1000,
  },
  processing: {
    maxDocumentSize: 10 * 1024 * 1024, // 10MB
    chunkSize: 4000,
    chunkOverlap: 200,
    batchSize: 5,
  },
  compliance: {
    minConfidenceThreshold: 0.2,
    frameworks: [
      'FERPA',
      'HIPAA',
      'IRB',
      'GDPR',
      'ADA/Section 508',
      'SOC 2',
      'ISO 27001',
      'Export Controls (EAR/ITAR)'
    ],
  },
  timeouts: {
    analysisTimeout: 300000, // 5 minutes
    streamingTimeout: 30000,  // 30 seconds
  }
} as const;

export const getGeminiApiKey = (): string => {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_GEMINI_API_KEY environment variable is not set');
  }
  return apiKey;
};

export type AIConfig = typeof AI_CONFIG;
export type ComplianceFramework = typeof AI_CONFIG.compliance.frameworks[number];