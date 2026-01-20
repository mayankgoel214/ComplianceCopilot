// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, User } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBtFFOizlXrp18p_e4TGMLudRy9O5Xs0rE",
  authDomain: "vthacks13-74208.firebaseapp.com",
  projectId: "vthacks13-74208",
  storageBucket: "vthacks13-74208.firebasestorage.app",
  messagingSenderId: "957212751673",
  appId: "1:957212751673:web:4b42e810ddb7c511b31ae8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Initialize Google Auth Provider with Drive scopes
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.metadata.readonly');
googleProvider.setCustomParameters({
  access_type: 'offline',
  prompt: 'consent'
});

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
    const result = await signInWithPopup(auth, googleProvider);

    // Extract Google OAuth credentials
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential && credential.accessToken) {
      googleAccessToken = credential.accessToken;
      googleRefreshToken = credential.refreshToken || null;

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
    await signOut(auth);
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
    const user = auth.currentUser;
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
    const user = auth.currentUser;
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
    const user = auth.currentUser;
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

export default app;