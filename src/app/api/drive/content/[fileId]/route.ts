import { NextRequest, NextResponse } from 'next/server';
import { getDriveService } from '@/lib/google-drive/drive-service';

// Helper function to verify Firebase token
async function verifyToken(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const idToken = authHeader.split('Bearer ')[1];
  const admin = await import('firebase-admin');

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// GET /api/drive/content/[fileId] - Get file content from Google Drive
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    // Verify Firebase ID token for user authentication
    await verifyToken(request.headers.get('authorization'));

    // Extract Google OAuth access token from header
    const oauthToken = request.headers.get('x-google-access-token');
    if (!oauthToken || oauthToken === 'null' || oauthToken === 'undefined') {
      return NextResponse.json(
        { error: 'Google OAuth access token required. Please sign out and sign in again to reconnect your Google Drive.' },
        { status: 401 }
      );
    }

    const { fileId } = await params;

    if (!fileId) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Pass the OAuth token to the drive service
    const driveService = await getDriveService(oauthToken);

    // Get file content
    const fileContent = await driveService.getFileContent(fileId);

    return NextResponse.json({
      fileId: fileContent.fileId,
      content: fileContent.content,
      mimeType: fileContent.mimeType,
      extractedAt: fileContent.extractedAt
    });
  } catch (error) {
    console.error('Error in GET /api/drive/content/[fileId]:', error);

    if (error instanceof Error) {
      if (error.message.includes('token') || error.message.includes('unauthorized') || error.message.includes('invalid_token')) {
        return NextResponse.json(
          { error: 'Google Drive access expired. Please sign out and sign in again to reconnect your Google Drive.' },
          { status: 401 }
        );
      }

      if (error.message.includes('access_token')) {
        return NextResponse.json(
          { error: 'Invalid Google Drive access token. Please sign out and sign in again.' },
          { status: 401 }
        );
      }

      if (error.message.includes('Failed to get')) {
        return NextResponse.json(
          { error: 'File not found or access denied' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to retrieve file content' },
      { status: 500 }
    );
  }
}