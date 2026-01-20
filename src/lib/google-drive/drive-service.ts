import { getDriveClient } from "./drive-client";
import { DriveFile, DriveFileContent } from "../db/types";
import {
  getTextExtractor,
  TextExtractionResult,
} from "../processing/text-extractor";

export class DriveService {
  private client: any = null;
  private textExtractor = getTextExtractor();

  async initialize(oauthToken?: string) {
    const driveClient = await getDriveClient(oauthToken);
    this.client = driveClient.getDriveInstance();
  }

  // List files in Google Drive with optional folder filtering
  async listFiles(
    folderId?: string,
    pageSize: number = 50
  ): Promise<DriveFile[]> {
    await this.ensureInitialized();

    try {
      let query = "trashed=false";
      if (folderId) {
        query += ` and '${folderId}' in parents`;
      }

      const response = await this.client.files.list({
        q: query,
        pageSize,
        fields:
          "files(id,name,mimeType,size,modifiedTime,webViewLink,parents,thumbnailLink,iconLink)",
        orderBy: "modifiedTime desc",
      });

      return response.data.files || [];
    } catch (error) {
      console.error("Error listing Drive files:", error);
      throw new Error("Failed to list Drive files");
    }
  }

  // Get file metadata by ID
  async getFileMetadata(fileId: string): Promise<DriveFile> {
    await this.ensureInitialized();

    try {
      const response = await this.client.files.get({
        fileId,
        fields:
          "id,name,mimeType,size,modifiedTime,webViewLink,parents,thumbnailLink,iconLink",
      });

      return response.data;
    } catch (error) {
      console.error("Error getting file metadata:", error);
      throw new Error(`Failed to get metadata for file ${fileId}`);
    }
  }

  // Get file content for supported file types
  async getFileContent(fileId: string): Promise<DriveFileContent> {
    await this.ensureInitialized();

    try {
      // Get file metadata first to determine how to extract content
      const metadata = await this.getFileMetadata(fileId);
      let content = "";

      // Handle different file types
      switch (metadata.mimeType) {
        case "application/vnd.google-apps.document":
          // Google Docs - export as plain text
          content = await this.exportGoogleDoc(fileId);
          break;

        case "application/vnd.google-apps.spreadsheet":
          // Google Sheets - export as CSV
          content = await this.exportGoogleSheet(fileId);
          break;

        case "application/vnd.google-apps.presentation":
          // Google Slides - export as plain text
          content = await this.exportGoogleSlides(fileId);
          break;

        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          // DOCX files - extract text using mammoth
          content = await this.extractDocxText(fileId);
          break;

        case "application/pdf":
          // PDF files - extract text using pdf-parse
          content = await this.extractPdfText(fileId);
          break;

        case "text/plain":
        case "text/csv":
        case "application/json":
          // Plain text files
          content = await this.downloadFile(fileId);
          break;

        default:
          // For other file types, just get basic info
          content = `File: ${metadata.name} (${metadata.mimeType})`;
          break;
      }

      return {
        fileId,
        content,
        mimeType: metadata.mimeType,
        extractedAt: new Date(),
      };
    } catch (error) {
      console.error("Error getting file content:", error);

      // Provide more specific error messages
      if (error instanceof Error) {
        if (
          error.message.includes("Permission denied") ||
          error.message.includes("access")
        ) {
          throw new Error(
            `Permission denied accessing file ${fileId}. Please check your Google Drive permissions.`
          );
        } else if (error.message.includes("not found")) {
          throw new Error(`File ${fileId} not found in Google Drive.`);
        } else if (
          error.message.includes("network") ||
          error.message.includes("timeout")
        ) {
          throw new Error(
            `Network error accessing file ${fileId}. Please try again.`
          );
        }
      }

      throw new Error(
        `Failed to get content for file ${fileId}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Export Google Docs as plain text
  private async exportGoogleDoc(fileId: string): Promise<string> {
    try {
      const response = await this.client.files.export({
        fileId,
        mimeType: "text/plain",
      });

      return response.data || "";
    } catch (error) {
      console.error("Error exporting Google Doc:", error);
      return "";
    }
  }

  // Export Google Sheets as CSV
  private async exportGoogleSheet(fileId: string): Promise<string> {
    try {
      const response = await this.client.files.export({
        fileId,
        mimeType: "text/csv",
      });

      return response.data || "";
    } catch (error) {
      console.error("Error exporting Google Sheet:", error);
      return "";
    }
  }

  // Export Google Slides as plain text
  private async exportGoogleSlides(fileId: string): Promise<string> {
    try {
      const response = await this.client.files.export({
        fileId,
        mimeType: "text/plain",
      });

      return response.data || "";
    } catch (error) {
      console.error("Error exporting Google Slides:", error);
      return "";
    }
  }

  // Download file content for non-Google file types
  private async downloadFile(fileId: string): Promise<string> {
    try {
      const response = await this.client.files.get({
        fileId,
        alt: "media",
      });

      return response.data || "";
    } catch (error) {
      console.error("Error downloading file:", error);
      return "";
    }
  }

  // Extract text from DOCX files
  private async extractDocxText(fileId: string): Promise<string> {
    try {
      console.log(`Starting DOCX text extraction for file: ${fileId}`);

      const response = await this.client.files.get(
        {
          fileId,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        }
      );

      console.log(
        `Downloaded DOCX file, size: ${response.data.byteLength} bytes`
      );

      const buffer = Buffer.from(response.data);

      // Validate buffer
      if (buffer.length === 0) {
        throw new Error("Downloaded file is empty");
      }

      console.log(`Extracting text from DOCX buffer using mammoth...`);
      const result = await this.textExtractor.extractFromDocx(buffer);

      console.log(
        `Successfully extracted ${result.text.length} characters from DOCX`
      );

      // Validate extracted text
      if (!result.text || result.text.trim().length === 0) {
        console.warn("DOCX extraction returned empty text");
        return "No text content found in DOCX file";
      }

      return result.text;
    } catch (error) {
      console.error("Error extracting text from DOCX:", error);

      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes("Invalid file format")) {
          return "Error: Invalid DOCX file format. Please ensure the file is a valid Word document.";
        } else if (error.message.includes("permission")) {
          return "Error: Permission denied accessing DOCX file. Please check file permissions.";
        } else if (
          error.message.includes("network") ||
          error.message.includes("timeout")
        ) {
          return "Error: Network error downloading DOCX file. Please try again.";
        } else if (error.message.includes("empty")) {
          return "Error: DOCX file appears to be empty or corrupted.";
        }
      }

      return `Error: Could not extract text from DOCX file (${
        error instanceof Error ? error.message : "Unknown error"
      })`;
    }
  }

  // Extract text from PDF files
  private async extractPdfText(fileId: string): Promise<string> {
    try {
      const response = await this.client.files.get(
        {
          fileId,
          alt: "media",
        },
        {
          responseType: "arraybuffer",
        }
      );

      const buffer = Buffer.from(response.data);
      const result = await this.textExtractor.extractFromPdf(buffer);

      return result.text;
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      return `Error: Could not extract text from PDF file (${
        error instanceof Error ? error.message : "Unknown error"
      })`;
    }
  }

  // Search files by name or content
  async searchFiles(
    query: string,
    pageSize: number = 20
  ): Promise<DriveFile[]> {
    await this.ensureInitialized();

    try {
      const searchQuery = `name contains '${query}' or fullText contains '${query}'`;

      const response = await this.client.files.list({
        q: `${searchQuery} and trashed=false`,
        pageSize,
        fields:
          "files(id,name,mimeType,size,modifiedTime,webViewLink,parents,thumbnailLink,iconLink)",
        orderBy: "relevance desc",
      });

      return response.data.files || [];
    } catch (error) {
      console.error("Error searching Drive files:", error);
      throw new Error("Failed to search Drive files");
    }
  }

  // Get files modified after a specific date
  async getRecentlyModifiedFiles(
    since: Date,
    pageSize: number = 50
  ): Promise<DriveFile[]> {
    await this.ensureInitialized();

    try {
      const sinceIso = since.toISOString();
      const query = `modifiedTime > '${sinceIso}' and trashed=false`;

      const response = await this.client.files.list({
        q: query,
        pageSize,
        fields:
          "files(id,name,mimeType,size,modifiedTime,webViewLink,parents,thumbnailLink,iconLink)",
        orderBy: "modifiedTime desc",
      });

      return response.data.files || [];
    } catch (error) {
      console.error("Error getting recently modified files:", error);
      throw new Error("Failed to get recently modified files");
    }
  }

  // Check if specific files have been modified since a given date
  async checkFilesForChanges(
    fileIds: string[],
    since: Date
  ): Promise<{ fileId: string; modified: boolean; lastModified?: Date }[]> {
    await this.ensureInitialized();

    const results = [];

    for (const fileId of fileIds) {
      try {
        const metadata = await this.getFileMetadata(fileId);
        const lastModified = new Date(metadata.modifiedTime);
        const modified = lastModified > since;

        results.push({
          fileId,
          modified,
          lastModified,
        });
      } catch (error) {
        console.error(`Error checking file ${fileId} for changes:`, error);
        results.push({
          fileId,
          modified: false,
        });
      }
    }

    return results;
  }

  // Helper method to ensure client is initialized
  private async ensureInitialized() {
    if (!this.client) {
      await this.initialize();
    }
  }
}

// Singleton instance
let driveServiceInstance: DriveService | null = null;

// Get or create the Drive service instance
export async function getDriveService(
  oauthToken?: string
): Promise<DriveService> {
  if (!driveServiceInstance) {
    driveServiceInstance = new DriveService();
  }

  await driveServiceInstance.initialize(oauthToken);
  return driveServiceInstance;
}

// Reset the service instance
export function resetDriveService(): void {
  driveServiceInstance = null;
}
