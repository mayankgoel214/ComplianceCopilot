import { NextRequest, NextResponse } from 'next/server';
import { getGeminiEmbeddingService } from '@/lib/ai/gemini-embeddings';

// POST /api/test/embedding-health - Test embedding service health
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { testQuery = 'test health check' } = body;

    console.log('🔍 Testing Gemini embedding service...');

    const embeddingService = getGeminiEmbeddingService();

    // Test basic health check
    const isHealthy = await embeddingService.healthCheck();

    if (!isHealthy) {
      return NextResponse.json(
        {
          success: false,
          error: 'Embedding service health check failed',
          details: 'Service is not responding correctly'
        },
        { status: 500 }
      );
    }

    // Test generating a query embedding
    const startTime = Date.now();
    const queryEmbedding = await embeddingService.generateQueryEmbedding(testQuery);
    const queryTime = Date.now() - startTime;

    // Test generating document embeddings
    const testDocuments = [
      'This is a test document for embedding generation.',
      'Another test document with different content.',
      'A third document to test batch processing.'
    ];

    const docStartTime = Date.now();
    const documentEmbeddings = await embeddingService.generateDocumentEmbeddings(testDocuments);
    const docTime = Date.now() - docStartTime;

    // Get service configuration
    const config = embeddingService.getConfig();

    return NextResponse.json({
      success: true,
      health: 'healthy',
      config: {
        model: config.model,
        dimensions: config.dimensions,
        maxBatchSize: config.maxBatchSize,
        rateLimitPerMinute: config.rateLimitPerMinute
      },
      tests: {
        queryEmbedding: {
          dimensions: queryEmbedding.length,
          responseTime: queryTime,
          sample: queryEmbedding.slice(0, 5) // First 5 values for verification
        },
        documentEmbeddings: {
          count: documentEmbeddings.length,
          dimensions: documentEmbeddings[0]?.length || 0,
          responseTime: docTime,
          averageResponseTime: Math.round(docTime / testDocuments.length)
        }
      },
      embedding: queryEmbedding,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Embedding service health check failed:', error);

    let errorDetails = 'Unknown error';
    let statusCode = 500;

    if (error instanceof Error) {
      errorDetails = error.message;

      // Categorize common errors
      if (error.message.includes('API key') || error.message.includes('GOOGLE_GEMINI_API_KEY')) {
        errorDetails = 'Google Gemini API key not configured';
        statusCode = 401;
      } else if (error.message.includes('quota') || error.message.includes('rate limit')) {
        errorDetails = 'API quota exceeded or rate limit reached';
        statusCode = 429;
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        errorDetails = 'Network error connecting to Gemini API';
        statusCode = 503;
      }
    }

    return NextResponse.json(
      {
        success: false,
        health: 'unhealthy',
        error: errorDetails,
        details: error instanceof Error ? error.stack : 'No additional details',
        timestamp: new Date().toISOString(),
        troubleshooting: {
          checkApiKey: 'Ensure GOOGLE_GEMINI_API_KEY is set in .env.local',
          checkQuota: 'Verify Google AI API quota and billing status',
          checkNetwork: 'Ensure network connectivity to ai.google.dev',
          documentation: 'https://ai.google.dev/gemini-api/docs/embeddings'
        }
      },
      { status: statusCode }
    );
  }
}

// GET /api/test/embedding-health - Get information about embedding health endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/test/embedding-health',
    description: 'Health check endpoint for Gemini embedding service',
    methods: ['POST'],
    parameters: {
      testQuery: {
        type: 'string',
        required: false,
        default: 'test health check',
        description: 'Query text to test embedding generation'
      }
    },
    response_format: {
      success: 'boolean',
      health: 'string (healthy|unhealthy)',
      config: 'embedding service configuration',
      tests: 'test results and performance metrics',
      embedding: 'sample embedding vector',
      error: 'error message if failed'
    },
    example_request: {
      testQuery: 'sample text for embedding test'
    }
  });
}