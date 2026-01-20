import { NextRequest, NextResponse } from 'next/server';
import { getProjectsService } from '@/lib/db/projects-service';
import { getDocumentsService } from '@/lib/db/documents-service';
import { getComplianceService } from '@/lib/db/compliance-service';

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

    // Get or create user
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

// GET /api/projects/[id] - Get project details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();
    const documentsService = getDocumentsService();
    const complianceService = getComplianceService();

    // Get project and verify ownership
    const project = await projectsService.getProjectById(projectId);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    if (project.user_id !== user.id) {
      return NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );
    }

    // Get project documents
    const documents = await documentsService.getDocumentsByProjectId(projectId);

    // Get compliance overview
    const complianceOverview = await complianceService.getComplianceOverview(projectId);

    // Get project statistics
    const stats = await projectsService.getProjectStats(projectId);

    return NextResponse.json({
      project,
      documents,
      compliance: complianceOverview,
      stats
    });
  } catch (error) {
    console.error('Error in GET /api/projects/[id]:', error);

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

// PUT /api/projects/[id] - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();

    // Verify ownership
    const isOwner = await projectsService.isProjectOwner(projectId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { name, description, status } = body;

    // Validate inputs
    const updateData: any = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        return NextResponse.json(
          { error: 'Project name must be a non-empty string' },
          { status: 400 }
        );
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = description?.trim() || null;
    }

    if (status !== undefined) {
      if (!['draft', 'analyzing', 'completed'].includes(status)) {
        return NextResponse.json(
          { error: 'Invalid status value' },
          { status: 400 }
        );
      }
      updateData.status = status;
    }

    // Update the project
    const updatedProject = await projectsService.updateProject(projectId, updateData);

    return NextResponse.json({ project: updatedProject });
  } catch (error) {
    console.error('Error in PUT /api/projects/[id]:', error);

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

// DELETE /api/projects/[id] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyTokenAndGetUser(request.headers.get('authorization'));
    const { id: projectId } = await params;

    const projectsService = getProjectsService();
    const complianceService = getComplianceService();

    // Verify ownership
    const isOwner = await projectsService.isProjectOwner(projectId, user.id);
    if (!isOwner) {
      return NextResponse.json(
        { error: 'Project not found or access denied' },
        { status: 404 }
      );
    }

    // Delete all related compliance data first
    await complianceService.deleteAllProjectCompliance(projectId);

    // Delete the project (this will cascade delete documents due to foreign key constraints)
    await projectsService.deleteProject(projectId);

    return NextResponse.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/projects/[id]:', error);

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