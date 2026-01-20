import { google } from 'googleapis';
import { getDriveAccessToken } from '../firebase/firebase';

// Google Drive API client configuration
export class DriveClient {
  private drive: any;
  private accessToken: string | null = null;

  constructor() {
    this.drive = null;
  }

  // Initialize the Drive client with OAuth access token
  async initialize(oauthToken?: string): Promise<void> {
    try {
      // Use provided OAuth token or get from Firebase
      this.accessToken = oauthToken || await getDriveAccessToken();

      if (!this.accessToken) {
        throw new Error('No access token available');
      }

      // Create OAuth2 client with the access token
      const auth = new google.auth.OAuth2();
      auth.setCredentials({
        access_token: this.accessToken,
      });

      // Initialize Drive API client
      this.drive = google.drive({
        version: 'v3',
        auth: auth,
      });

    } catch (error) {
      console.error('Failed to initialize Drive client:', error);
      throw error;
    }
  }

  // Get the Drive API client instance
  getDriveInstance() {
    if (!this.drive) {
      throw new Error('Drive client not initialized. Call initialize() first.');
    }
    return this.drive;
  }

  // Check if client is initialized
  isInitialized(): boolean {
    return this.drive !== null && this.accessToken !== null;
  }

  // Refresh the access token and reinitialize if needed
  async refreshToken(): Promise<void> {
    await this.initialize();
  }
}

// Singleton instance
let driveClientInstance: DriveClient | null = null;

// Get or create the Drive client instance
export async function getDriveClient(oauthToken?: string): Promise<DriveClient> {
  if (!driveClientInstance) {
    driveClientInstance = new DriveClient();
  }

  if (!driveClientInstance.isInitialized() || oauthToken) {
    await driveClientInstance.initialize(oauthToken);
  }

  return driveClientInstance;
}

// Reset the client instance (useful for auth changes)
export function resetDriveClient(): void {
  driveClientInstance = null;
}