import mammoth from "mammoth";
import pdf from "pdf-parse";
import { Readable } from "stream";

/**
 * Text extraction utilities for different file types
 */

export interface TextExtractionResult {
  text: string;
  metadata?: {
    title?: string;
    author?: string;
    pages?: number;
    words?: number;
  };
}

export class TextExtractor {
  /**
   * Extract text from DOCX buffer
   */
  async extractFromDocx(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      console.log(`Extracting text from DOCX buffer (${buffer.length} bytes)`);

      // Validate buffer
      if (!buffer || buffer.length === 0) {
        throw new Error("Invalid or empty buffer provided");
      }

      // Check if buffer looks like a DOCX file (ZIP signature)
      if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw new Error(
          "Invalid DOCX file format - file does not appear to be a valid Word document"
        );
      }

      const result = await mammoth.extractRawText({ buffer });

      console.log(
        `Mammoth extraction completed. Text length: ${result.value.length}`
      );

      // Basic word count
      const words = result.value
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0).length;

      // Validate extracted text
      if (!result.value || result.value.trim().length === 0) {
        console.warn("Mammoth extracted empty text from DOCX");
        return {
          text: "No readable text content found in this DOCX file",
          metadata: {
            words: 0,
          },
        };
      }

      return {
        text: result.value,
        metadata: {
          words,
        },
      };
    } catch (error) {
      console.error("Error extracting text from DOCX:", error);

      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes("Invalid DOCX file format")) {
          throw new Error(
            "Invalid DOCX file format - file does not appear to be a valid Word document"
          );
        } else if (error.message.includes("Invalid or empty buffer")) {
          throw new Error("Invalid or empty file data provided");
        } else if (
          error.message.includes("corrupt") ||
          error.message.includes("damaged")
        ) {
          throw new Error("DOCX file appears to be corrupted or damaged");
        }
      }

      throw new Error(
        `Failed to extract text from DOCX: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Extract text from PDF buffer
   */
  async extractFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      const data = await pdf(buffer);

      return {
        text: data.text,
        metadata: {
          title: data.info?.Title,
          author: data.info?.Author,
          pages: data.numpages,
          words: data.text.trim().split(/\s+/).length,
        },
      };
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      throw new Error(
        `Failed to extract text from PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Extract text from buffer based on MIME type
   */
  async extractFromBuffer(
    buffer: Buffer,
    mimeType: string
  ): Promise<TextExtractionResult> {
    switch (mimeType) {
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return this.extractFromDocx(buffer);

      case "application/pdf":
        return this.extractFromPdf(buffer);

      default:
        throw new Error(`Unsupported file type: ${mimeType}`);
    }
  }

  /**
   * Extract text from a stream
   */
  async extractFromStream(
    stream: Readable,
    mimeType: string
  ): Promise<TextExtractionResult> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on("data", (chunk) => {
        chunks.push(chunk);
      });

      stream.on("end", async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const result = await this.extractFromBuffer(buffer, mimeType);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      stream.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Check if a MIME type is supported for text extraction
   */
  isSupportedMimeType(mimeType: string): boolean {
    const supportedTypes = [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
      "application/pdf", // PDF
    ];

    return supportedTypes.includes(mimeType);
  }

  /**
   * Get the appropriate extraction method name for a MIME type
   */
  getExtractionMethod(mimeType: string): string {
    switch (mimeType) {
      case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return "DOCX extraction";
      case "application/pdf":
        return "PDF extraction";
      default:
        return "Unknown extraction";
    }
  }
}

// Singleton instance
let extractorInstance: TextExtractor | null = null;

export function getTextExtractor(): TextExtractor {
  if (!extractorInstance) {
    extractorInstance = new TextExtractor();
  }
  return extractorInstance;
}
