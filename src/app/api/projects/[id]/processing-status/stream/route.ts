import { NextRequest } from "next/server";
import { getDocumentProcessor } from "@/lib/processing/document-processor";
import { sql } from "@/lib/db/neon-client";

// Helper function to verify Firebase token
async function verifyToken(authHeader: string | null, urlToken?: string) {
  // Try to get token from header first, then from URL parameter
  let idToken: string | null = null;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    idToken = authHeader.split("Bearer ")[1];
  } else if (urlToken) {
    idToken = urlToken;
  }

  if (!idToken) {
    throw new Error("Missing or invalid authorization token");
  }

  const admin = await import("firebase-admin");

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error("Invalid token");
  }
}

// SSE endpoint for real-time processing status updates
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;
    const url = new URL(request.url);
    const urlToken = url.searchParams.get("token");

    // Verify Firebase ID token for user authentication
    await verifyToken(
      request.headers.get("authorization"),
      urlToken || undefined
    );

    if (!projectId) {
      return new Response("Project ID is required", { status: 400 });
    }

    // Create a readable stream for SSE
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        // Send initial connection message
        const sendEvent = (data: any, event = "status") => {
          const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        };

        // Send initial status
        const sendInitialStatus = async () => {
          try {
            const processor = getDocumentProcessor();

            // Get current processing status
            const recentJobs = await sql`
              SELECT
                id, project_id, document_id, job_type, status,
                total_documents, processed_documents, total_chunks, processed_chunks,
                started_at, completed_at, error_message, created_at,
                EXTRACT(EPOCH FROM (COALESCE(completed_at, CURRENT_TIMESTAMP) - started_at)) as duration_seconds
              FROM processing_jobs
              WHERE project_id = ${projectId}
              ORDER BY created_at DESC
              LIMIT 20
            `;

            const projectStats = await sql`
              SELECT
                COUNT(DISTINCT d.id) as total_documents,
                COUNT(DISTINCT dc.id) as total_chunks,
                SUM(dc.tokens) as total_tokens,
                AVG(dc.tokens) as avg_chunk_size,
                COUNT(DISTINCT d.id) FILTER (WHERE d.last_analyzed IS NOT NULL) as processed_documents,
                MAX(d.last_analyzed) as last_processing_date
              FROM documents d
              LEFT JOIN document_chunks dc ON d.id = dc.document_id
              WHERE d.project_id = ${projectId}
            `;

            const stats = projectStats[0] as any;
            const activeJobs = recentJobs.filter(
              (job: any) => job.status === "pending" || job.status === "running"
            );

            const isProcessing = activeJobs.length > 0;
            const processingProgress =
              stats.total_documents > 0
                ? (stats.processed_documents / stats.total_documents) * 100
                : 0;

            const statusData = {
              project_id: projectId,
              processing_status: {
                is_processing: isProcessing,
                active_jobs: activeJobs.length,
                progress_percentage: Math.round(processingProgress),
                last_processing_date: stats.last_processing_date,
              },
              statistics: {
                total_documents: parseInt(stats.total_documents) || 0,
                processed_documents: parseInt(stats.processed_documents) || 0,
                total_chunks: parseInt(stats.total_chunks) || 0,
                total_tokens: parseInt(stats.total_tokens) || 0,
                average_chunk_size: Math.round(
                  parseFloat(stats.avg_chunk_size) || 0
                ),
              },
              recent_jobs: recentJobs.map((job: any) => ({
                job_id: job.id,
                document_id: job.document_id,
                job_type: job.job_type,
                status: job.status,
                progress: {
                  documents: {
                    total: job.total_documents || 0,
                    processed: job.processed_documents || 0,
                  },
                  chunks: {
                    total: job.total_chunks || 0,
                    processed: job.processed_chunks || 0,
                  },
                },
                timing: {
                  started_at: job.started_at,
                  completed_at: job.completed_at,
                  duration_seconds: job.duration_seconds
                    ? Math.round(job.duration_seconds)
                    : null,
                },
                error: job.error_message
                  ? { message: job.error_message }
                  : null,
                created_at: job.created_at,
              })),
            };

            sendEvent(statusData, "initial");
          } catch (error) {
            console.error("Error sending initial status:", error);
            sendEvent({ error: "Failed to get initial status" }, "error");
          }
        };

        // Send initial status
        sendInitialStatus();

        // Set up polling for updates
        const pollInterval = setInterval(async () => {
          try {
            const recentJobs = await sql`
              SELECT
                id, project_id, document_id, job_type, status,
                total_documents, processed_documents, total_chunks, processed_chunks,
                started_at, completed_at, error_message, created_at,
                EXTRACT(EPOCH FROM (COALESCE(completed_at, CURRENT_TIMESTAMP) - started_at)) as duration_seconds
              FROM processing_jobs
              WHERE project_id = ${projectId}
              AND updated_at > CURRENT_TIMESTAMP - INTERVAL '1 minute'
              ORDER BY created_at DESC
              LIMIT 20
            `;

            if (recentJobs.length > 0) {
              const projectStats = await sql`
                SELECT
                  COUNT(DISTINCT d.id) as total_documents,
                  COUNT(DISTINCT dc.id) as total_chunks,
                  SUM(dc.tokens) as total_tokens,
                  AVG(dc.tokens) as avg_chunk_size,
                  COUNT(DISTINCT d.id) FILTER (WHERE d.last_analyzed IS NOT NULL) as processed_documents,
                  MAX(d.last_analyzed) as last_processing_date
                FROM documents d
                LEFT JOIN document_chunks dc ON d.id = dc.document_id
                WHERE d.project_id = ${projectId}
              `;

              const stats = projectStats[0] as any;
              const activeJobs = recentJobs.filter(
                (job: any) =>
                  job.status === "pending" || job.status === "running"
              );

              const isProcessing = activeJobs.length > 0;
              const processingProgress =
                stats.total_documents > 0
                  ? (stats.processed_documents / stats.total_documents) * 100
                  : 0;

              const statusData = {
                project_id: projectId,
                processing_status: {
                  is_processing: isProcessing,
                  active_jobs: activeJobs.length,
                  progress_percentage: Math.round(processingProgress),
                  last_processing_date: stats.last_processing_date,
                },
                statistics: {
                  total_documents: parseInt(stats.total_documents) || 0,
                  processed_documents: parseInt(stats.processed_documents) || 0,
                  total_chunks: parseInt(stats.total_chunks) || 0,
                  total_tokens: parseInt(stats.total_tokens) || 0,
                  average_chunk_size: Math.round(
                    parseFloat(stats.avg_chunk_size) || 0
                  ),
                },
                recent_jobs: recentJobs.map((job: any) => ({
                  job_id: job.id,
                  document_id: job.document_id,
                  job_type: job.job_type,
                  status: job.status,
                  progress: {
                    documents: {
                      total: job.total_documents || 0,
                      processed: job.processed_documents || 0,
                    },
                    chunks: {
                      total: job.total_chunks || 0,
                      processed: job.processed_chunks || 0,
                    },
                  },
                  timing: {
                    started_at: job.started_at,
                    completed_at: job.completed_at,
                    duration_seconds: job.duration_seconds
                      ? Math.round(job.duration_seconds)
                      : null,
                  },
                  error: job.error_message
                    ? { message: job.error_message }
                    : null,
                  created_at: job.created_at,
                })),
              };

              sendEvent(statusData, "update");
            }
          } catch (error) {
            console.error("Error polling for updates:", error);
            sendEvent({ error: "Failed to get status update" }, "error");
          }
        }, 2000); // Poll every 2 seconds

        // Cleanup function
        const cleanup = () => {
          clearInterval(pollInterval);
          controller.close();
        };

        // Handle client disconnect
        request.signal.addEventListener("abort", cleanup);

        // Keep connection alive with heartbeat
        const heartbeatInterval = setInterval(() => {
          sendEvent({ timestamp: Date.now() }, "heartbeat");
        }, 30000); // Send heartbeat every 30 seconds

        // Cleanup heartbeat on disconnect
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeatInterval);
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
      },
    });
  } catch (error) {
    console.error("Error in SSE endpoint:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("token") ||
        error.message.includes("unauthorized")
      ) {
        return new Response("Authentication failed", { status: 401 });
      }
    }

    return new Response("Failed to establish SSE connection", { status: 500 });
  }
}
