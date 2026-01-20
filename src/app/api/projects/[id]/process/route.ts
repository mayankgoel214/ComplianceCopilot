import { NextRequest, NextResponse } from "next/server";
import { getDocumentProcessor } from "@/lib/processing/document-processor";

// Helper function to verify Firebase token
async function verifyToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const idToken = authHeader.split("Bearer ")[1];
  const admin = await import("firebase-admin");

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error("Invalid token");
  }
}

// POST /api/projects/[id]/process - Trigger document processing for a project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Verify Firebase ID token for user authentication
    await verifyToken(request.headers.get("authorization"));

    // Extract Google OAuth access token from header
    const oauthToken = request.headers.get("x-google-access-token");
    if (!oauthToken || oauthToken === "null" || oauthToken === "undefined") {
      return NextResponse.json(
        {
          error:
            "Google OAuth access token required. Please sign out and sign in again to reconnect your Google Drive.",
        },
        { status: 401 }
      );
    }

    const { id: projectId } = await params;

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    // Parse request body for processing options
    const body = await request.json().catch(() => ({}));
    const {
      document_ids,
      chunking_config = {},
      force_reprocess = false,
      include_embeddings = true,
      store_in_vector_db = true,
    } = body;

    const processor = getDocumentProcessor();

    // If specific document IDs are provided, process only those
    if (document_ids && Array.isArray(document_ids)) {
      const results = [];
      const { getDocumentsService } = await import(
        "@/lib/db/documents-service"
      );
      const documentsService = getDocumentsService();

      for (const documentId of document_ids) {
        try {
          // Find the document to get the drive file ID
          const document = await documentsService.getDocumentById(documentId);
          if (!document) {
            throw new Error(`Document ${documentId} not found`);
          }

          const result = await processor.processDocument(
            projectId,
            document.drive_file_id,
            oauthToken,
            {
              chunking_config,
              force_reprocess,
              include_embeddings,
              store_in_vector_db,
            }
          );

          results.push(result);
        } catch (error) {
          console.error(`Failed to process document ${documentId}:`, error);
          results.push({
            document_id: documentId,
            error: error instanceof Error ? error.message : "Processing failed",
          });
        }
      }

      return NextResponse.json({
        success: true,
        message: `Processing completed for ${results.length} documents`,
        results,
        total_processed: results.filter((r) => !r.error).length,
        total_failed: results.filter((r) => r.error).length,
      });
    } else {
      // Process entire project
      const results = await processor.processProject(projectId, oauthToken, {
        chunking_config,
        force_reprocess,
        include_embeddings,
        store_in_vector_db,
      });

      return NextResponse.json({
        success: true,
        message: `Processing completed for project`,
        results,
        total_documents: results.length,
        total_chunks: results.reduce(
          (sum, r) => sum + r.metrics.total_chunks,
          0
        ),
        total_tokens: results.reduce(
          (sum, r) => sum + r.metrics.total_tokens,
          0
        ),
        average_processing_time:
          results.reduce((sum, r) => sum + r.metrics.processing_time_ms, 0) /
          results.length,
      });
    }
  } catch (error) {
    console.error("Error in POST /api/projects/[id]/process:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("token") ||
        error.message.includes("unauthorized")
      ) {
        return NextResponse.json(
          {
            error: "Authentication failed. Please sign out and sign in again.",
          },
          { status: 401 }
        );
      }

      if (error.message.includes("access_token")) {
        return NextResponse.json(
          {
            error:
              "Invalid Google Drive access token. Please sign out and sign in again.",
          },
          { status: 401 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to process documents",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
