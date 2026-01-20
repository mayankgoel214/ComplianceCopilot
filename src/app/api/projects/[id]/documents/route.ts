import { NextRequest, NextResponse } from "next/server";
import { getDocumentsService } from "@/lib/db/documents-service";
import { getDriveService } from "@/lib/google-drive/drive-service";
import {
  verifyProjectOwnership,
  verifyTokenAndGetUser,
} from "@/lib/auth/auth-service";

// GET /api/projects/[id]/documents - Get all documents for a project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Verify authentication and project ownership
    const user = await verifyProjectOwnership(
      request.headers.get("authorization"),
      projectId
    );

    const documentsService = getDocumentsService();

    // Get documents for the project
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    // Get document statistics
    const stats = await documentsService.getProjectDocumentStats(projectId);

    return NextResponse.json({
      documents,
      stats,
    });
  } catch (error) {
    console.error("Error in GET /api/projects/[id]/documents:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("token") ||
        error.message.includes("Invalid") ||
        error.message.includes("authorization")
      ) {
        return NextResponse.json(
          {
            error: "Authentication failed. Please sign out and sign in again.",
          },
          { status: 401 }
        );
      }

      if (
        error.message.includes("access denied") ||
        error.message.includes("not found")
      ) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to fetch documents. Please try again." },
      { status: 500 }
    );
  }
}

// POST /api/projects/[id]/documents - Link a Google Drive file to the project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Verify authentication and project ownership
    const user = await verifyProjectOwnership(
      request.headers.get("authorization"),
      projectId
    );

    const documentsService = getDocumentsService();

    // Parse request body
    const body = await request.json();
    const { driveFileId } = body;

    if (!driveFileId || typeof driveFileId !== "string") {
      return NextResponse.json(
        { error: "Drive file ID is required" },
        { status: 400 }
      );
    }

    // Check if document is already linked
    const existingDocument = await documentsService.getDocumentByDriveFileId(
      driveFileId
    );
    if (existingDocument) {
      return NextResponse.json(
        { error: "Document is already linked to a project" },
        { status: 409 }
      );
    }

    // Get Google OAuth token from request headers
    const googleToken = request.headers.get("x-google-token");
    if (!googleToken) {
      return NextResponse.json(
        { error: "Google OAuth token is required" },
        { status: 400 }
      );
    }

    // Get file metadata from Google Drive
    const driveService = await getDriveService(googleToken);
    let driveFile;

    try {
      driveFile = await driveService.getFileMetadata(driveFileId);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            "Failed to access Google Drive file. Please check permissions.",
        },
        { status: 400 }
      );
    }

    // Check if the selected item is a folder
    if (driveFile.mimeType === "application/vnd.google-apps.folder") {
      // Handle folder selection - add all files in the folder
      try {
        const folderFiles = await driveService.listFiles(driveFileId, 100);
        const createdDocuments = [];

        for (const file of folderFiles) {
          // Skip subfolders to avoid complexity
          if (file.mimeType === "application/vnd.google-apps.folder") {
            continue;
          }

          // Check if file is already linked to any project
          const existingDoc = await documentsService.getDocumentByDriveFileId(
            file.id
          );
          if (existingDoc) {
            continue; // Skip files already linked
          }

          // Create document record for each file
          const document = await documentsService.createDocument({
            project_id: projectId,
            drive_file_id: file.id,
            file_name: file.name,
            file_type: file.mimeType?.split("/")[1] || "unknown",
            mime_type: file.mimeType,
            drive_url: file.webViewLink,
            parent_folder_id: driveFileId, // Use the folder ID as parent
            last_modified: file.modifiedTime
              ? new Date(file.modifiedTime)
              : null,
            file_size: file.size ? parseInt(file.size) : null,
          });

          createdDocuments.push(document);
        }

        // Auto-trigger processing for all newly linked documents
        try {
          const { getDocumentProcessor } = await import(
            "@/lib/processing/document-processor"
          );
          const processor = getDocumentProcessor();

          // Process all documents in the background
          for (const doc of createdDocuments) {
            processor
              .processDocument(projectId, doc.drive_file_id, googleToken, {
                include_embeddings: true,
                store_in_vector_db: true,
              })
              .catch((error) => {
                console.error(
                  `Background processing failed for document ${doc.id}:`,
                  error
                );
              });
          }
        } catch (error) {
          console.error(
            "Failed to trigger background processing for folder:",
            error
          );
          // Don't fail the request if processing fails to start
        }

        return NextResponse.json(
          {
            documents: createdDocuments,
            folderName: driveFile.name,
            totalFiles: folderFiles.length,
            addedFiles: createdDocuments.length,
            skippedFiles: folderFiles.length - createdDocuments.length,
            processing_triggered: true,
            message: `Folder linked and processing started for ${createdDocuments.length} documents`,
          },
          { status: 201 }
        );
      } catch (error) {
        console.error("Error processing folder contents:", error);
        return NextResponse.json(
          { error: "Failed to process folder contents" },
          { status: 500 }
        );
      }
    }

    // Handle individual file selection (existing logic)
    // Create document record
    const document = await documentsService.createDocument({
      project_id: projectId,
      drive_file_id: driveFileId,
      file_name: driveFile.name,
      file_type: driveFile.mimeType?.split("/")[1] || "unknown",
      mime_type: driveFile.mimeType,
      drive_url: driveFile.webViewLink,
      parent_folder_id: driveFile.parents?.[0] || null,
      last_modified: driveFile.modifiedTime
        ? new Date(driveFile.modifiedTime)
        : null,
      file_size: driveFile.size ? parseInt(driveFile.size) : null,
    });

    // Auto-trigger processing for the newly linked document
    try {
      const { getDocumentProcessor } = await import(
        "@/lib/processing/document-processor"
      );
      const processor = getDocumentProcessor();

      // Process the document in the background
      processor
        .processDocument(projectId, driveFileId, googleToken, {
          include_embeddings: true,
          store_in_vector_db: true,
        })
        .catch((error) => {
          console.error(
            `Background processing failed for document ${document.id}:`,
            error
          );
        });
    } catch (error) {
      console.error("Failed to trigger background processing:", error);
      // Don't fail the request if processing fails to start
    }

    return NextResponse.json(
      {
        document,
        processing_triggered: true,
        message: "Document linked and processing started",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error in POST /api/projects/[id]/documents:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("token") ||
        error.message.includes("Invalid") ||
        error.message.includes("authorization")
      ) {
        return NextResponse.json(
          {
            error: "Authentication failed. Please sign out and sign in again.",
          },
          { status: 401 }
        );
      }

      if (
        error.message.includes("access denied") ||
        error.message.includes("not found")
      ) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 }
        );
      }

      if (error.message.includes("already linked")) {
        return NextResponse.json(
          { error: "Document is already linked to a project" },
          { status: 409 }
        );
      }

      if (error.message.includes("Drive") || error.message.includes("Google")) {
        return NextResponse.json(
          {
            error:
              "Failed to access Google Drive. Please check your permissions and try again.",
          },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to link document. Please try again." },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]/documents - Unlink documents from project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Verify authentication and project ownership
    const user = await verifyProjectOwnership(
      request.headers.get("authorization"),
      projectId
    );

    const documentsService = getDocumentsService();

    // Parse request body
    const body = await request.json();
    const { documentId, driveFileId } = body;

    if (!documentId && !driveFileId) {
      return NextResponse.json(
        { error: "Either documentId or driveFileId is required" },
        { status: 400 }
      );
    }

    // Delete the document
    if (documentId) {
      // Verify document belongs to this project
      const isDocumentInProject = await documentsService.isDocumentInProject(
        documentId,
        projectId
      );
      if (!isDocumentInProject) {
        return NextResponse.json(
          { error: "Document not found in this project" },
          { status: 404 }
        );
      }

      await documentsService.deleteDocument(documentId);
    } else if (driveFileId) {
      // Find and delete by Drive file ID
      const document = await documentsService.getDocumentByDriveFileId(
        driveFileId
      );
      if (!document || document.project_id !== projectId) {
        return NextResponse.json(
          { error: "Document not found in this project" },
          { status: 404 }
        );
      }

      await documentsService.deleteDocumentByDriveFileId(driveFileId);
    }

    return NextResponse.json({ message: "Document unlinked successfully" });
  } catch (error) {
    console.error("Error in DELETE /api/projects/[id]/documents:", error);

    if (error instanceof Error) {
      if (
        error.message.includes("token") ||
        error.message.includes("Invalid") ||
        error.message.includes("authorization")
      ) {
        return NextResponse.json(
          {
            error: "Authentication failed. Please sign out and sign in again.",
          },
          { status: 401 }
        );
      }

      if (
        error.message.includes("access denied") ||
        error.message.includes("not found")
      ) {
        return NextResponse.json(
          { error: "Project not found or access denied" },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to remove document. Please try again." },
      { status: 500 }
    );
  }
}
