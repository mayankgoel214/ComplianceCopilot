import admin from 'firebase-admin';

// Singleton Firebase Admin instance
let firebaseAdminInstance: admin.app.App | null = null;

// Firebase Admin configuration
const getFirebaseAdminConfig = () => {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'vthacks13-74208',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  // Validate required environment variables
  if (!serviceAccount.clientEmail || !serviceAccount.privateKey) {
    throw new Error('Missing Firebase Admin SDK configuration. Check FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY environment variables.');
  }

  return {
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.projectId,
  };
};

// Initialize Firebase Admin SDK
export function getFirebaseAdmin(): admin.app.App {
  try {
    // Return existing instance if already initialized
    if (firebaseAdminInstance) {
      return firebaseAdminInstance;
    }

    // Check if Firebase Admin is already initialized
    if (admin.apps.length > 0) {
      firebaseAdminInstance = admin.apps[0] as admin.app.App;
      return firebaseAdminInstance;
    }

    // Initialize new Firebase Admin instance
    const config = getFirebaseAdminConfig();
    firebaseAdminInstance = admin.initializeApp(config);

    return firebaseAdminInstance;
  } catch (error) {
    console.error('Failed to initialize Firebase Admin:', error);
    throw new Error('Firebase Admin initialization failed');
  }
}

// Verify Firebase ID token and get user information
export async function verifyFirebaseToken(idToken: string) {
  try {
    const firebaseAdmin = getFirebaseAdmin();
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || '',
      name: decodedToken.name || null,
      emailVerified: decodedToken.email_verified || false,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    throw new Error('Invalid or expired token');
  }
}

// Helper function to extract token from authorization header
export function extractBearerToken(authHeader: string | null): string {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  return authHeader.split('Bearer ')[1];
}

// Combined function to verify token and get user from auth header
export async function verifyTokenAndGetUserInfo(authHeader: string | null) {
  const idToken = extractBearerToken(authHeader);
  return await verifyFirebaseToken(idToken);
}