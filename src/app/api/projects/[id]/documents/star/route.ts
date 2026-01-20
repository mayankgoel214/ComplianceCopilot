import { NextRequest, NextResponse } from 'next/server';
import { getProjectsService } from '@/lib/db/projects-service';
import { getDocumentsService } from '@/lib/db/documents-service';

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

// POST /api/projects/[id]/documents/star - Star document(s)
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

    // Parse request body
    const body = await request.json();
    const { documentIds } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'Document IDs array is required' },
        { status: 400 }
      );
    }

    // Verify all documents belong to this project
    const starredDocuments = [];
    const errors = [];

    for (const documentId of documentIds) {
      try {
        const isInProject = await documentsService.isDocumentInProject(documentId, projectId);
        if (!isInProject) {
          errors.push({ documentId, error: 'Document not found in project' });
          continue;
        }

        const starredDoc = await documentsService.starDocument({
          project_id: projectId,
          document_id: documentId
        });
        starredDocuments.push(starredDoc);
      } catch (error) {
        errors.push({ documentId, error: 'Failed to star document' });
      }
    }

    return NextResponse.json({
      message: `Successfully starred ${starredDocuments.length} documents`,
      starredDocuments,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in POST /api/projects/[id]/documents/star:', error);

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

// DELETE /api/projects/[id]/documents/star - Unstar document(s)
export async function DELETE(
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

    // Parse request body
    const body = await request.json();
    const { documentIds } = body;

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json(
        { error: 'Document IDs array is required' },
        { status: 400 }
      );
    }

    // Unstar documents
    const unstarredDocuments = [];
    const errors = [];

    for (const documentId of documentIds) {
      try {
        const isInProject = await documentsService.isDocumentInProject(documentId, projectId);
        if (!isInProject) {
          errors.push({ documentId, error: 'Document not found in project' });
          continue;
        }

        const success = await documentsService.unstarDocument(projectId, documentId);
        if (success) {
          unstarredDocuments.push(documentId);
        } else {
          errors.push({ documentId, error: 'Document was not starred' });
        }
      } catch (error) {
        errors.push({ documentId, error: 'Failed to unstar document' });
      }
    }

    return NextResponse.json({
      message: `Successfully unstarred ${unstarredDocuments.length} documents`,
      unstarredDocuments,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in DELETE /api/projects/[id]/documents/star:', error);

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