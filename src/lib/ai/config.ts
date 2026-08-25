export const AI_CONFIG = {
  gemini: {
    // gemini-2.5-flash is closed to new API keys — it still appears in the
    // models listing but returns 404 "no longer available to new users" for any
    // key created after the cutoff, which is a failure mode that only shows up
    // on a fresh key and not on the developer's own.
    model: 'gemini-3.6-flash',
    temperature: 0.1,
    maxTokens: 8192,
    maxRetries: 3,
  },
  embeddings: {
    // text-embedding-004 was retired; the API no longer serves it and every
    // embedding call returned 404.
    //
    // gemini-embedding-001 defaults to 3072 dimensions, but accepts
    // outputDimensionality — which gemini-embeddings.ts already passes. Holding
    // it at 768 keeps existing stored vectors comparable with new ones; raising
    // it would mean re-embedding every document.
    model: 'gemini-embedding-001',
    dimensions: 768,
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