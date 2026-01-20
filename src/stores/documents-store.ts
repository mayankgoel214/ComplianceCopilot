import { create } from "zustand";
import { Document, DriveFileContent } from "@/lib/db/types";
import { SyncStatus } from "@/components/processor/sync-status";

interface DocumentsState {
  // State
  documents: Document[];
  selectedDocument: Document | null;
  documentContent: DriveFileContent | null;
  isLoading: boolean;
  isLoadingContent: boolean;
  syncStatus: SyncStatus;
  error: string | null;
  lastSyncTime: Date | null;

  // Actions
  fetchDocuments: (projectId: string) => Promise<void>;
  linkDriveFile: (projectId: string, driveFileId: string) => Promise<void>;
  unlinkDocument: (projectId: string, documentId: string) => Promise<void>;
  fetchDocumentContent: (fileId: string) => Promise<DriveFileContent>;
  checkForChanges: (projectId: string) => Promise<void>;
  refreshDocuments: (projectId: string) => Promise<void>;
  selectDocument: (document: Document | null) => void;
  clearError: () => void;
  reset: () => void;
}

// Helper function to get Firebase ID token for user authentication
async function getAuthToken(): Promise<string> {
  const { auth } = await import("@/lib/firebase/firebase");
  const user = auth.currentUser;

  if (!user) {
    throw new Error("No authenticated user");
  }

  return user.getIdToken();
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  // Initial state
  documents: [],
  selectedDocument: null,
  documentContent: null,
  isLoading: false,
  isLoadingContent: false,
  syncStatus: "idle",
  error: null,
  lastSyncTime: null,

  // Fetch documents for a project
  fetchDocuments: async (projectId: string) => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch documents: ${response.statusText}`);
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      set({
        documents: data.documents || [],
        isLoading: false,
        lastSyncTime: new Date(),
      });
    } catch (error) {
      console.error("Error fetching documents:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to fetch documents",
        isLoading: false,
      });
    }
  },

  // Link a Google Drive file to a project
  linkDriveFile: async (projectId: string, driveFileId: string) => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ driveFileId }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to link document");
      }

      const data = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      const newDocument = data.document;

      // Add to documents list
      const { documents } = get();
      set({
        documents: [...documents, newDocument],
        isLoading: false,
        lastSyncTime: new Date(),
      });
    } catch (error) {
      console.error("Error linking document:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to link document",
        isLoading: false,
      });
      throw error;
    }
  },

  // Unlink a document from a project
  unlinkDocument: async (projectId: string, documentId: string) => {
    try {
      set({ isLoading: true, error: null });

      const token = await getAuthToken();
      const response = await fetch(`/api/projects/${projectId}/documents`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ documentId }),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || "Failed to unlink document");
      }

      // Remove from documents list
      const { documents, selectedDocument } = get();
      const updatedDocuments = documents.filter((d) => d.id !== documentId);
      const updatedSelectedDocument =
        selectedDocument?.id === documentId ? null : selectedDocument;

      set({
        documents: updatedDocuments,
        selectedDocument: updatedSelectedDocument,
        isLoading: false,
        lastSyncTime: new Date(),
      });
    } catch (error) {
      console.error("Error unlinking document:", error);
      set({
        error:
          error instanceof Error ? error.message : "Failed to unlink document",
        isLoading: false,
      });
      throw error;
    }
  },

  // Fetch content for a specific document
  fetchDocumentContent: async (fileId: string) => {
    try {
      set({ isLoadingContent: true, error: null });

      // Get authentication tokens
      const authToken = await getAuthToken();
      const { getDriveAccessToken } = await import("@/lib/firebase/firebase");
      const oauthToken = await getDriveAccessToken();

      // Validate that we have required tokens
      if (!authToken) {
        throw new Error("User authentication required. Please sign in.");
      }

      if (!oauthToken) {
        throw new Error(
          "Google Drive access not available. Please sign out and sign in again to connect your Google Drive."
        );
      }

      const response = await fetch(`/api/drive/content/${fileId}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
          "X-Google-Access-Token": oauthToken,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: response.statusText }));

        // Handle specific error cases
        if (response.status === 401) {
          throw new Error(
            "Google Drive access expired. Please sign out and sign in again to reconnect your Google Drive."
          );
        }

        throw new Error(
          errorData.error ||
            `Failed to fetch document content: ${response.statusText}`
        );
      }

      const content = await response.json().catch(() => {
        throw new Error("Invalid response format from server");
      });
      set({
        documentContent: content,
        isLoadingContent: false,
      });

      return content;
    } catch (error) {
      console.error("Error fetching document content:", error);
      set({
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch document content",
        isLoadingContent: false,
      });
      throw error;
    }
  },

  // Check for document changes since last sync
  checkForChanges: async (projectId: string) => {
    try {
      set({ syncStatus: "syncing" });

      // This would typically call an API endpoint that checks for changes
      // For now, we'll just refresh the documents
      await get().fetchDocuments(projectId);

      set({
        syncStatus: "success",
        lastSyncTime: new Date(),
      });
    } catch (error) {
      console.error("Error checking for changes:", error);
      set({
        syncStatus: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to check for changes",
      });
    }
  },

  // Refresh documents with sync status tracking
  refreshDocuments: async (projectId: string) => {
    try {
      set({ syncStatus: "syncing" });

      await get().fetchDocuments(projectId);

      set({ syncStatus: "success" });
    } catch (error) {
      console.error("Error refreshing documents:", error);
      set({
        syncStatus: "error",
        error:
          error instanceof Error
            ? error.message
            : "Failed to refresh documents",
      });
    }
  },

  // Select a document for viewing/editing
  selectDocument: (document: Document | null) => {
    set({
      selectedDocument: document,
      documentContent: null, // Clear previous content
    });
  },

  // Clear error state
  clearError: () => {
    set({ error: null });
  },

  // Reset store to initial state
  reset: () => {
    set({
      documents: [],
      selectedDocument: null,
      documentContent: null,
      isLoading: false,
      isLoadingContent: false,
      syncStatus: "idle",
      error: null,
      lastSyncTime: null,
    });
  },
}));
