import { NextRequest, NextResponse } from "next/server";
import { testConnection } from "@/lib/db/neon-client";
import { getGeminiEmbeddingService } from "@/lib/ai/gemini-embeddings";
import { getChromaService } from "@/lib/vector/chroma-service";

// Helper function to test individual services
async function testService(
  serviceName: string,
  testFn: () => Promise<boolean>,
  provider?: string
) {
  try {
    const isHealthy = await testFn();
    return {
      status: isHealthy ? "healthy" : "unhealthy",
      provider,
      ...(isHealthy ? {} : { connection: "failed" }),
    };
  } catch (error) {
    return {
      status: "unhealthy",
      provider,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// GET /api/health - Comprehensive health check endpoint
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const healthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    services: {} as Record<string, any>,
    responseTime: 0,
  };

  try {
    // Test all services in parallel
    const [dbResult, embeddingResult, vectorResult, firebaseResult] =
      await Promise.all([
        testService("database", testConnection),
        testService(
          "embeddings",
          async () => {
            const service = getGeminiEmbeddingService();
            return await service.healthCheck();
          },
          "gemini"
        ),
        testService(
          "vector_db",
          async () => {
            const { getVectorService } = await import(
              "@/lib/vector/chroma-service"
            );
            const service = await getVectorService();
            return await service.healthCheck();
          },
          "chromadb"
        ),
        testService("firebase", async () => {
          const admin = await import("firebase-admin");
          return admin.apps.length > 0;
        }),
      ]);

    healthStatus.services.database = dbResult;
    healthStatus.services.embeddings = embeddingResult;
    healthStatus.services.vector_db = vectorResult;
    healthStatus.services.firebase = {
      ...firebaseResult,
      initialized: firebaseResult.status === "healthy",
    };

    // Determine overall health
    const allServicesHealthy = Object.values(healthStatus.services).every(
      (service) => service.status === "healthy"
    );

    healthStatus.status = allServicesHealthy ? "healthy" : "degraded";
    healthStatus.responseTime = Date.now() - startTime;

    const statusCode = allServicesHealthy ? 200 : 503;

    return NextResponse.json(healthStatus, { status: statusCode });
  } catch (error) {
    healthStatus.status = "unhealthy";
    healthStatus.responseTime = Date.now() - startTime;
    healthStatus.error =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(healthStatus, { status: 500 });
  }
}

// Helper function to test specific service
async function testSpecificService(serviceName: string): Promise<any> {
  const timestamp = new Date().toISOString();

  switch (serviceName) {
    case "database":
      return {
        healthy: await testConnection(),
        timestamp,
      };
    case "embeddings":
      try {
        const service = getGeminiEmbeddingService();
        const isHealthy = await service.healthCheck();
        return { healthy: isHealthy, timestamp };
      } catch (error) {
        return {
          healthy: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp,
        };
      }
    case "vector_db":
      try {
        const { getVectorService } = await import(
          "@/lib/vector/chroma-service"
        );
        const service = await getVectorService();
        const isHealthy = await service.healthCheck();
        return { healthy: isHealthy, timestamp };
      } catch (error) {
        return {
          healthy: false,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp,
        };
      }
    default:
      return { healthy: false, error: "Unknown service", timestamp };
  }
}

// POST /api/health - Detailed health check with specific service tests
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { services = ["all"] } = body;

    const results: Record<string, any> = {};

    // Test specific services based on request
    const serviceTests = [];
    if (services.includes("all") || services.includes("database")) {
      serviceTests.push(["database", testSpecificService("database")]);
    }
    if (services.includes("all") || services.includes("embeddings")) {
      serviceTests.push(["embeddings", testSpecificService("embeddings")]);
    }
    if (services.includes("all") || services.includes("vector_db")) {
      serviceTests.push(["vector_db", testSpecificService("vector_db")]);
    }

    // Execute all tests in parallel
    const testResults = await Promise.all(
      serviceTests.map(async ([name, testFn]) => [name, await testFn])
    );

    // Build results object
    testResults.forEach(([name, result]) => {
      results[name] = result;
    });

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
