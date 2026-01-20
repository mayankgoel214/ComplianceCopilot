import { NextRequest, NextResponse } from 'next/server';
import { getDocumentsService } from '@/lib/db/documents-service';
import { getDriveService } from '@/lib/google-drive/drive-service';
import { verifyProjectOwnership } from '@/lib/auth/auth-service';

// GET /api/projects/[id]/documents/list-folder - Get folder contents from Google Drive
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Verify authentication and project ownership
    const user = await verifyProjectOwnership(request.headers.get('authorization'), projectId);

    const url = new URL(request.url);
    const folderId = url.searchParams.get('folderId');

    if (!folderId) {
      return NextResponse.json(
        { error: 'Folder ID is required' },
        { status: 400 }
      );
    }

    const documentsService = getDocumentsService();

    // Get Google OAuth token from request headers
    const googleToken = request.headers.get('x-google-token');
    if (!googleToken) {
      return NextResponse.json(
        { error: 'Google OAuth token is required' },
        { status: 400 }
      );
    }

    // Get folder contents from Google Drive using the OAuth token
    const driveService = await getDriveService(googleToken);
    const folderFiles = await driveService.listFiles(folderId, 100);

    // Get existing documents for this project to check which are already linked
    const existingDocuments = await documentsService.getDocumentsByProjectId(projectId);
    const existingFileIds = new Set(existingDocuments.map(doc => doc.drive_file_id));

    // Get starred documents for this project
    const starredDocuments = await documentsService.getStarredDocumentsByProjectId(projectId);
    const starredFileIds = new Set(starredDocuments.map(star => star.document_id));

    // Enrich files with project status and starred status
    const enrichedFiles = folderFiles.map(file => {
      const existingDoc = existingDocuments.find(doc => doc.drive_file_id === file.id);
      return {
        ...file,
        isLinkedToProject: existingFileIds.has(file.id),
        isStarred: existingDoc ? starredFileIds.has(existingDoc.id) : false,
        documentId: existingDoc?.id || null,
        fileSize: file.size ? parseInt(file.size) : null,
        lastModified: file.modifiedTime ? new Date(file.modifiedTime) : null,
      };
    });

    return NextResponse.json({
      folderId,
      files: enrichedFiles,
      totalFiles: enrichedFiles.length,
      linkedFiles: enrichedFiles.filter(f => f.isLinkedToProject).length,
      starredFiles: enrichedFiles.filter(f => f.isStarred).length,
    });

  } catch (error) {
    console.error('Error in GET /api/projects/[id]/documents/list-folder:', error);

    if (error instanceof Error) {
      // Handle authentication errors
      if (error.message.includes('token') || error.message.includes('Invalid') || error.message.includes('authorization')) {
        return NextResponse.json(
          { error: 'Authentication failed. Please sign out and sign in again.' },
          { status: 401 }
        );
      }

      // Handle project access errors
      if (error.message.includes('access denied') || error.message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found or access denied' },
          { status: 404 }
        );
      }

      // Handle Google Drive API errors
      if (error.message.includes('Drive') || error.message.includes('Google')) {
        return NextResponse.json(
          { error: 'Failed to access Google Drive. Please check your permissions and try again.' },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch folder contents. Please try again.' },
      { status: 500 }
    );
  }
}