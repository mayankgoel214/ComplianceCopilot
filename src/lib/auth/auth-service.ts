import { verifyTokenAndGetUserInfo } from '../firebase/firebase-admin';
import { getProjectsService } from '../db/projects-service';

export interface AuthenticatedUser {
  id: string;
  firebase_uid: string;
  email: string;
  name: string | null;
  created_at: Date;
  updated_at: Date;
}

// Verify Firebase token and get or create user in database
export async function verifyTokenAndGetUser(authHeader: string | null): Promise<AuthenticatedUser> {
  try {
    // Verify Firebase token
    const tokenData = await verifyTokenAndGetUserInfo(authHeader);

    // Get database user
    const projectsService = getProjectsService();
    let user = await projectsService.getUserByFirebaseId(tokenData.uid);

    // Create user if doesn't exist
    if (!user) {
      user = await projectsService.createUser({
        firebase_uid: tokenData.uid,
        email: tokenData.email,
        name: tokenData.name,
      });
    }

    return user as AuthenticatedUser;
  } catch (error) {
    console.error('Authentication failed:', error);
    throw error;
  }
}

// Check if user owns a project
export async function verifyProjectOwnership(
  authHeader: string | null,
  projectId: string
): Promise<AuthenticatedUser> {
  const user = await verifyTokenAndGetUser(authHeader);
  const projectsService = getProjectsService();

  const isOwner = await projectsService.isProjectOwner(projectId, user.id);
  if (!isOwner) {
    throw new Error('Project not found or access denied');
  }

  return user;
}