import { NextRequest, NextResponse } from 'next/server';
import { getProjectsService } from '@/lib/db/projects-service';
import { getDocumentsService } from '@/lib/db/documents-service';
import { getDriveService } from '@/lib/google-drive/drive-service';

// Helper function to verify Firebase token and get user
async function verifyTokenAndGetUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  const admin = await import('firebase-admin');

  try {
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID || 'vthacks13-74208',
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const projectsService = getProjectsService();

    let user = await projectsService.getUserByFirebaseId(decodedToken.uid);
    if (!user) {
      user = await projectsService.createUser({
        firebase_uid: decodedToken.uid,
        email: decodedToken.email || '',
        name: decodedToken.name,
      });
    }

    return user;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// POST /api/projects/[id]/sync - Check for document changes and sync metadata
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();
    const documentsService = getDocumentsService();

    // Verify project ownership
    const isOwner = await projectsService.isProjectOwner(projectId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Get all documents for the project
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    if (documents.length === 0) {
      return NextResponse.json({
        message: 'No documents to sync',
        changes: [],
        totalDocuments: 0,
        changedDocuments: 0,
      });
    }

    // Initialize Google Drive service
    const driveService = await getDriveService();
    const changes = [];
    let changedCount = 0;

    // Check each document for changes
    for (const document of documents) {
      try {
        // Get current metadata from Google Drive
        const driveMetadata = await driveService.getFileMetadata(document.drive_file_id);
        const driveModifiedTime = new Date(driveMetadata.modifiedTime);
        const dbModifiedTime = document.last_modified ? new Date(document.last_modified) : null;

        // Check if document has been modified
        const hasChanged = !dbModifiedTime || driveModifiedTime > dbModifiedTime;

        if (hasChanged) {
          // Update document metadata in database
          await documentsService.syncDocumentMetadata(document.drive_file_id, {
            name: driveMetadata.name,
            mimeType: driveMetadata.mimeType,
            modifiedTime: driveMetadata.modifiedTime,
            size: driveMetadata.size,
            webViewLink: driveMetadata.webViewLink,
          });

          changes.push({
            documentId: document.id,
            fileName: driveMetadata.name,
            previousModified: dbModifiedTime,
            currentModified: driveModifiedTime,
            changeType: dbModifiedTime ? 'modified' : 'new',
          });

          changedCount++;
        }
      } catch (error) {
        console.error(`Error checking document ${document.drive_file_id}:`, error);
        changes.push({
          documentId: document.id,
          fileName: document.file_name,
          error: 'Failed to check for changes',
          changeType: 'error',
        });
      }
    }

    // Update project's updated_at timestamp if any changes were found
    if (changedCount > 0) {
      await projectsService.updateProject(projectId, {
        status: 'draft' // Reset to draft if documents changed
      });
    }

    return NextResponse.json({
      message: `Sync completed. Found ${changedCount} changed documents.`,
      changes,
      totalDocuments: documents.length,
      changedDocuments: changedCount,
      syncedAt: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Error in POST /api/projects/[id]/sync:', error);

    if (error instanceof Error && error.message.includes('token')) {
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}