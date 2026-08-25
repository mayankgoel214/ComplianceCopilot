// Import the functions you need from the SDKs you need
import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, type Auth, User } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialised on first use, not at import.
//
// This module used to call initializeApp() and getAuth() at the top level, and
// getAuth() throws immediately when no Firebase key is configured. The agent
// tools reach this file transitively — document-analysis-tool imports
// document-processor, which imports the Drive service, which imports this — so
// merely importing an agent demanded Firebase credentials and threw before any
// agent code could run. Nothing here needs to happen until someone signs in.
let firebaseApp: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let googleProviderInstance: GoogleAuthProvider | undefined;

/**
 * Whether a Firebase project is configured for this deployment.
 *
 * The public pages — the landing page and the demo — need no account, so a
 * deployment can legitimately run without Firebase. Callers check this rather
 * than letting getAuth() throw and take the whole client render with it.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}

function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    firebaseApp = initializeApp(firebaseConfig);
  }
  return firebaseApp;
}

/** The Auth instance, created on first call. */
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

function getGoogleProvider(): GoogleAuthProvider {
  if (!googleProviderInstance) {
    googleProviderInstance = new GoogleAuthProvider();
    googleProviderInstance.addScope('https://www.googleapis.com/auth/drive.readonly');
    googleProviderInstance.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
    googleProviderInstance.setCustomParameters({
      access_type: 'offline',
      prompt: 'consent'
    });
  }
  return googleProviderInstance;
}

// SessionStorage keys for token persistence
const GOOGLE_ACCESS_TOKEN_KEY = 'google_access_token';
const GOOGLE_REFRESH_TOKEN_KEY = 'google_refresh_token';

// Store for Google OAuth access token (memory cache)
let googleAccessToken: string | null = null;
let googleRefreshToken: string | null = null;

// Helper functions for sessionStorage
const storeTokens = (accessToken: string | null, refreshToken: string | null) => {
  if (typeof window !== 'undefined') {
    if (accessToken) {
      sessionStorage.setItem(GOOGLE_ACCESS_TOKEN_KEY, accessToken);
    } else {
      sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    }

    if (refreshToken) {
      sessionStorage.setItem(GOOGLE_REFRESH_TOKEN_KEY, refreshToken);
    } else {
      sessionStorage.removeItem(GOOGLE_REFRESH_TOKEN_KEY);
    }
  }
};

const loadTokensFromStorage = () => {
  if (typeof window !== 'undefined') {
    googleAccessToken = sessionStorage.getItem(GOOGLE_ACCESS_TOKEN_KEY);
    googleRefreshToken = sessionStorage.getItem(GOOGLE_REFRESH_TOKEN_KEY);
  }
};

const clearStoredTokens = () => {
  if (typeof window !== 'undefined') {
    sessionStorage.removeItem(GOOGLE_ACCESS_TOKEN_KEY);
    sessionStorage.removeItem(GOOGLE_REFRESH_TOKEN_KEY);
  }
  googleAccessToken = null;
  googleRefreshToken = null;
};

// Auth helper functions
export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());

    // Extract Google OAuth credentials
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential && credential.accessToken) {
      googleAccessToken = credential.accessToken;
      // OAuthCredential carries no refresh token in the web SDK; a refresh
      // requires the server-side flow. Recorded as absent rather than pretended.
      googleRefreshToken = null;

      // Store tokens in sessionStorage for persistence
      storeTokens(googleAccessToken, googleRefreshToken);

      console.log('Google OAuth access token obtained and stored successfully');
    } else {
      console.warn('No OAuth access token received from Google sign-in');
      // Clear any stale tokens
      clearStoredTokens();
    }

    return result.user;
  } catch (error) {
    console.error("Error signing in with Google:", error);
    // Clear tokens on sign-in error
    clearStoredTokens();
    throw error;
  }
};

export const logOut = async (): Promise<void> => {
  try {
    await signOut(getFirebaseAuth());
    // Clear stored tokens from memory and sessionStorage
    clearStoredTokens();
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

// Get Google Drive access token from the current user
export const getDriveAccessToken = async (): Promise<string | null> => {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      console.warn("No authenticated user found when requesting Drive access token");
      throw new Error("No authenticated user found");
    }

    // If token is not in memory, try to load from sessionStorage
    if (!googleAccessToken) {
      loadTokensFromStorage();
      console.log('Loaded tokens from sessionStorage:', { hasAccessToken: !!googleAccessToken });
    }

    // Return the stored Google OAuth access token
    if (!googleAccessToken) {
      console.error("No Google OAuth access token available. User needs to sign in again with Google Drive permissions.");
      throw new Error("No Google OAuth access token available. Please sign out and sign in again to grant Google Drive access.");
    }

    return googleAccessToken;
  } catch (error) {
    console.error("Error getting Drive access token:", error);
    return null;
  }
};

// Initialize tokens from sessionStorage on app load
export const initializeTokens = (): void => {
  loadTokensFromStorage();
};

// Check if user has granted Drive permissions
export const hasDrivePermissions = async (): Promise<boolean> => {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) return false;

    // If token is not in memory, try to load from sessionStorage
    if (!googleAccessToken) {
      loadTokensFromStorage();
    }

    // Check if we have a valid Google OAuth access token
    return !!googleAccessToken;
  } catch (error) {
    console.error("Error checking Drive permissions:", error);
    return false;
  }
};

// Refresh Google OAuth access token
export const refreshGoogleAccessToken = async (): Promise<string | null> => {
  try {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      throw new Error("No authenticated user found");
    }

    // Force refresh the user's tokens
    await user.getIdToken(true);

    // If token is not in memory, try to load from sessionStorage
    if (!googleAccessToken) {
      loadTokensFromStorage();
    }

    // If we have a refresh token, we could implement proper OAuth refresh here
    // For now, request user to sign in again if token is invalid
    if (!googleAccessToken) {
      throw new Error("Access token expired. Please sign in again.");
    }

    return googleAccessToken;
  } catch (error) {
    console.error("Error refreshing access token:", error);
    return null;
  }
};

// The app itself is lazy now, so a default export of the instance is not
// possible. Callers that need it should go through getFirebaseAuth().
export default getFirebaseApp;