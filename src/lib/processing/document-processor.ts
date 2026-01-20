import { getDriveService } from "../google-drive/drive-service";
import { DocumentsService } from "../db/documents-service";
import { getGeminiService } from "../ai/gemini-service";
import { getGeminiEmbeddingService } from "../ai/gemini-embeddings";
import { getChromaService } from "../vector/chroma-service";
import {
  SemanticChunker,
  ChunkingConfig,
  DocumentChunk,
} from "./semantic-chunker";
import { AI_CONFIG } from "../ai/config";
import { sql } from "../db/neon-client";

export interface ProcessingOptions {
  chunking_config?: Partial<ChunkingConfig>;
  force_reprocess?: boolean; // Reprocess even if already processed
  include_embeddings?: boolean; // Generate embeddings
  store_in_vector_db?: boolean; // Store in ChromaDB
}

export interface ProcessingStatus {
  job_id: string;
  project_id: string;
  document_id?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress: {
    total_documents: number;
    processed_documents: number;
    total_chunks: number;
    processed_chunks: number;
    current_operation: string;
  };
  timing: {
    started_at?: Date;
    completed_at?: Date;
    duration_seconds?: number;
  };
  error?: {
    message: string;
    stack?: string;
  };
  result?: {
    total_chunks: number;
    total_tokens: number;
    average_chunk_size: number;
    semantic_coherence: number;
  };
}

export interface ProcessingResult {
  job_id: string;
  chunks: DocumentChunk[];
  embeddings?: number[][];
  metrics: {
    total_chunks: number;
    total_tokens: number;
    average_chunk_size: number;
    processing_time_ms: number;
    semantic_coherence: number;
  };
}

export class DocumentProcessor {
  private documentsService = new DocumentsService();
  private geminiService = getGeminiService();
  private embeddingService = getGeminiEmbeddingService();
  private chromaService = getChromaService();
  private semanticChunker = new SemanticChunker();
  private activeJobs = new Map<string, ProcessingStatus>();
  private eventEmitter = new (require("events").EventEmitter)();

  /**
   * Process a single document through the complete pipeline
   */
  async processDocument(
    projectId: string,
    driveFileId: string,
    oauthToken: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const jobId = this.generateJobId();
    const startTime = Date.now();

    try {
      // Create processing job
      const status = await this.createProcessingJob(
        jobId,
        projectId,
        driveFileId
      );
      this.activeJobs.set(jobId, status);

      // Step 1: Extract document content from Google Drive
      await this.updateJobProgress(
        jobId,
        "Extracting document content from Google Drive"
      );
      const driveService = await getDriveService(oauthToken);

      console.log(`Starting content extraction for file: ${driveFileId}`);
      const fileContent = await driveService.getFileContent(driveFileId);

      // Validate extracted content
      if (!fileContent.content || fileContent.content.trim().length === 0) {
        throw new Error(
          "No content could be extracted from the document. The file may be empty, corrupted, or in an unsupported format."
        );
      }

      console.log(
        `Successfully extracted ${fileContent.content.length} characters from document`
      );

      // Step 2: Store/update document metadata
      await this.updateJobProgress(jobId, "Updating document metadata");
      const metadata = await driveService.getFileMetadata(driveFileId);
      const document = await this.documentsService.createDocument({
        project_id: projectId,
        drive_file_id: driveFileId,
        file_name: metadata.name || "Unknown",
        file_type: this.getFileType(metadata.mimeType),
        mime_type: metadata.mimeType,
        drive_url: metadata.webViewLink,
        file_size: metadata.size ? parseInt(metadata.size) : null,
        last_modified: metadata.modifiedTime
          ? new Date(metadata.modifiedTime)
          : null,
      });

      // Step 3: Check if reprocessing is needed
      if (
        !options.force_reprocess &&
        (await this.isDocumentProcessed(document.id))
      ) {
        await this.updateJobStatus(
          jobId,
          "completed",
          "Document already processed"
        );
        const existingChunks = await this.getExistingChunks(document.id);
        return this.createProcessingResult(jobId, existingChunks, startTime);
      }

      // Step 4: Clean existing chunks if reprocessing
      if (options.force_reprocess) {
        await this.updateJobProgress(jobId, "Cleaning existing chunks");
        await this.cleanExistingChunks(projectId, document.id);
      }

      // Step 5: Chunk the document
      await this.updateJobProgress(jobId, "Performing semantic chunking");

      // For very large documents, use progressive chunking
      let chunkingConfig = options.chunking_config || {};
      if (fileContent.content.length > 100000) {
        // 100KB+
        console.log(
          `Large document detected: ${fileContent.content.length} characters. Applying memory-optimized chunking.`
        );
        chunkingConfig = {
          ...chunkingConfig,
          max_chunk_size: Math.min(chunkingConfig.max_chunk_size || 500, 400),
          target_chunk_size: Math.min(
            chunkingConfig.target_chunk_size || 300,
            350
          ),
          prefer_semantic_boundaries: true,
          respect_section_boundaries: true,
        };
      }

      const chunkingResult = await this.semanticChunker.chunkDocument(
        fileContent.content,
        document.id,
        driveFileId,
        metadata.name || "Unknown",
        chunkingConfig
      );

      // Step 6: Generate embeddings if requested
      let embeddings: number[][] | undefined;
      if (options.include_embeddings !== false) {
        await this.updateJobProgress(jobId, "Generating embeddings");
        embeddings = await this.generateEmbeddings(chunkingResult.chunks);
      }

      // Step 7: Store chunks in database
      await this.updateJobProgress(jobId, "Storing chunks in database");
      await this.storeChunksInDB(chunkingResult.chunks);

      // Step 8: Store in vector database if requested
      if (options.store_in_vector_db !== false && embeddings) {
        await this.updateJobProgress(jobId, "Storing in vector database");
        await this.chromaService.addDocumentChunks(
          projectId,
          chunkingResult.chunks,
          embeddings
        );
      }

      // Step 9: Update document processing status
      await this.updateJobProgress(jobId, "Finalizing processing");
      await this.markDocumentAsProcessed(document.id);

      // Complete the job
      const endTime = Date.now();
      await this.updateJobStatus(
        jobId,
        "completed",
        "Processing completed successfully"
      );

      return {
        job_id: jobId,
        chunks: chunkingResult.chunks,
        embeddings,
        metrics: {
          total_chunks: chunkingResult.total_chunks,
          total_tokens: chunkingResult.total_tokens,
          average_chunk_size: chunkingResult.average_chunk_size,
          processing_time_ms: endTime - startTime,
          semantic_coherence: chunkingResult.semantic_coherence,
        },
      };
    } catch (error) {
      console.error(`Processing failed for job ${jobId}:`, error);

      // Provide more specific error messages for common issues
      let errorMessage = "Unknown error";
      if (error instanceof Error) {
        if (error.message.includes("No content could be extracted")) {
          errorMessage =
            "Document processing failed: Unable to extract text content from the file. Please ensure the file is a valid DOCX, PDF, or other supported format.";
        } else if (error.message.includes("Invalid DOCX file format")) {
          errorMessage =
            "Document processing failed: The file does not appear to be a valid DOCX document. Please check the file format.";
        } else if (
          error.message.includes("Permission denied") ||
          error.message.includes("access")
        ) {
          errorMessage =
            "Document processing failed: Permission denied accessing the file. Please check your Google Drive permissions.";
        } else if (
          error.message.includes("network") ||
          error.message.includes("timeout")
        ) {
          errorMessage =
            "Document processing failed: Network error while downloading the file. Please try again.";
        } else {
          errorMessage = error.message;
        }
      }

      await this.updateJobStatus(jobId, "failed", errorMessage);
      throw new Error(errorMessage);
    } finally {
      // Clean up active job tracking
      setTimeout(() => {
        this.activeJobs.delete(jobId);
      }, 5 * 60 * 1000); // Keep for 5 minutes for status queries
    }
  }

  /**
   * Process all documents in a project
   */
  async processProject(
    projectId: string,
    oauthToken: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessingResult[]> {
    const jobId = this.generateJobId();

    try {
      // Get all documents in the project
      const documents = await this.documentsService.getDocumentsByProjectId(
        projectId
      );

      if (documents.length === 0) {
        throw new Error("No documents found in project");
      }

      // Create project-wide processing job
      const status = await this.createProcessingJob(jobId, projectId);
      status.progress.total_documents = documents.length;
      this.activeJobs.set(jobId, status);

      const results: ProcessingResult[] = [];

      // Process each document
      for (let i = 0; i < documents.length; i++) {
        const document = documents[i];

        try {
          await this.updateJobProgress(
            jobId,
            `Processing document ${i + 1}/${documents.length}: ${
              document.file_name
            }`
          );

          const result = await this.processDocument(
            projectId,
            document.drive_file_id,
            oauthToken,
            options
          );

          results.push(result);
          status.progress.processed_documents = i + 1;
        } catch (error) {
          console.error(
            `Failed to process document ${document.file_name}:`,
            error
          );
          // Continue with other documents
        }
      }

      await this.updateJobStatus(
        jobId,
        "completed",
        `Processed ${results.length}/${documents.length} documents`
      );
      return results;
    } catch (error) {
      console.error(`Project processing failed for job ${jobId}:`, error);
      await this.updateJobStatus(
        jobId,
        "failed",
        error instanceof Error ? error.message : "Unknown error"
      );
      throw error;
    }
  }

  /**
   * Generate embeddings for chunks using Gemini
   */
  private async generateEmbeddings(
    chunks: DocumentChunk[]
  ): Promise<number[][]> {
    if (chunks.length === 0) {
      return [];
    }

    try {
      // Extract text content from chunks
      const texts = chunks.map((chunk) => chunk.content);

      // Use Gemini embedding service with batching and rate limiting
      const result = await this.embeddingService.generateEmbeddings(texts, {
        taskType: "document",
      });

      console.log(
        `Generated ${result.embeddings.length} embeddings using ${result.requestCount} API requests`
      );
      console.log(`Token usage: ${result.tokensUsed} tokens`);

      return result.embeddings;
    } catch (error) {
      console.error(
        "Failed to generate embeddings with Gemini service:",
        error
      );
      console.warn("Falling back to zero embeddings for all chunks");

      // Return zero embeddings as fallback
      const fallbackEmbeddings = chunks.map(() =>
        new Array(AI_CONFIG.embeddings.dimensions).fill(0)
      );
      return fallbackEmbeddings;
    }
  }

  /**
   * Store chunks in the database
   */
  private async storeChunksInDB(chunks: DocumentChunk[]): Promise<void> {
    for (const chunk of chunks) {
      try {
        await sql`
          INSERT INTO document_chunks (
            id, document_id, content, tokens, position,
            heading_path, hierarchy_level, chunk_type,
            semantic_density, topic_keywords,
            has_overlap_previous, has_overlap_next, overlap_text,
            previous_chunk_id, next_chunk_id,
            sibling_chunk_ids, child_chunk_ids,
            chunking_method, created_at
          ) VALUES (
            ${chunk.id}, ${chunk.document_id}, ${chunk.content}, ${chunk.tokens}, ${chunk.position},
            ${chunk.heading_path}, ${chunk.hierarchy_level}, ${chunk.chunk_type},
            ${chunk.semantic_density}, ${chunk.topic_keywords},
            ${chunk.has_overlap_previous}, ${chunk.has_overlap_next}, ${chunk.overlap_text},
            ${chunk.previous_chunk_id}, ${chunk.next_chunk_id},
            ${chunk.sibling_chunk_ids}, ${chunk.child_chunk_ids},
            ${chunk.metadata.chunking_method}, ${chunk.metadata.created_at}
          )
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            tokens = EXCLUDED.tokens,
            semantic_density = EXCLUDED.semantic_density,
            topic_keywords = EXCLUDED.topic_keywords
        `;
      } catch (error) {
        console.error(`Failed to store chunk ${chunk.id}:`, error);
        throw error;
      }
    }
  }

  /**
   * Create a processing job record
   */
  private async createProcessingJob(
    jobId: string,
    projectId: string,
    documentId?: string
  ): Promise<ProcessingStatus> {
    const status: ProcessingStatus = {
      job_id: jobId,
      project_id: projectId,
      document_id: documentId,
      status: "pending",
      progress: {
        total_documents: documentId ? 1 : 0,
        processed_documents: 0,
        total_chunks: 0,
        processed_chunks: 0,
        current_operation: "Initializing",
      },
      timing: {},
    };

    try {
      await sql`
        INSERT INTO processing_jobs (
          id, project_id, document_id, job_type, status,
          total_documents, processed_documents, total_chunks, processed_chunks,
          created_at
        ) VALUES (
          ${jobId}, ${projectId}, ${documentId}, 'full_pipeline', 'pending',
          ${status.progress.total_documents}, 0, 0, 0,
          CURRENT_TIMESTAMP
        )
      `;
    } catch (error) {
      console.error("Failed to create processing job:", error);
    }

    return status;
  }

  /**
   * Update job progress
   */
  private async updateJobProgress(
    jobId: string,
    operation: string
  ): Promise<void> {
    const status = this.activeJobs.get(jobId);
    if (status) {
      status.progress.current_operation = operation;
      if (status.status === "pending") {
        status.status = "running";
        status.timing.started_at = new Date();
      }
    }

    try {
      await sql`
        UPDATE processing_jobs
        SET
          status = 'running',
          started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${jobId}
      `;

      // Emit real-time update event
      this.emitProgressUpdate(jobId, status);
    } catch (error) {
      console.error("Failed to update job progress:", error);
    }
  }

  /**
   * Update job status
   */
  private async updateJobStatus(
    jobId: string,
    status: ProcessingStatus["status"],
    message?: string
  ): Promise<void> {
    const jobStatus = this.activeJobs.get(jobId);
    if (jobStatus) {
      jobStatus.status = status;
      if (status === "completed" || status === "failed") {
        jobStatus.timing.completed_at = new Date();
        if (jobStatus.timing.started_at) {
          jobStatus.timing.duration_seconds = Math.floor(
            (jobStatus.timing.completed_at.getTime() -
              jobStatus.timing.started_at.getTime()) /
              1000
          );
        }
      }
      if (status === "failed" && message) {
        jobStatus.error = { message };
      }
    }

    try {
      const completedAt =
        status === "completed" || status === "failed"
          ? "CURRENT_TIMESTAMP"
          : null;
      await sql`
        UPDATE processing_jobs
        SET
          status = ${status},
          completed_at = ${completedAt ? sql`CURRENT_TIMESTAMP` : null},
          error_message = ${message || null},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ${jobId}
      `;

      // Emit real-time update event
      this.emitProgressUpdate(jobId, jobStatus);
    } catch (error) {
      console.error("Failed to update job status:", error);
    }
  }

  /**
   * Emit progress update event
   */
  private emitProgressUpdate(
    jobId: string,
    status: ProcessingStatus | undefined
  ): void {
    if (status) {
      this.eventEmitter.emit("progressUpdate", {
        jobId,
        projectId: status.project_id,
        status,
      });
    }
  }

  /**
   * Get processing job status
   */
  async getJobStatus(jobId: string): Promise<ProcessingStatus | null> {
    // Check active jobs first
    const activeStatus = this.activeJobs.get(jobId);
    if (activeStatus) {
      return activeStatus;
    }

    // Check database
    try {
      const result = await sql`
        SELECT
          id, project_id, document_id, status,
          total_documents, processed_documents, total_chunks, processed_chunks,
          started_at, completed_at, error_message,
          created_at
        FROM processing_jobs
        WHERE id = ${jobId}
      `;

      if (result.length === 0) return null;

      const row = result[0] as any;
      return {
        job_id: row.id,
        project_id: row.project_id,
        document_id: row.document_id,
        status: row.status,
        progress: {
          total_documents: row.total_documents || 0,
          processed_documents: row.processed_documents || 0,
          total_chunks: row.total_chunks || 0,
          processed_chunks: row.processed_chunks || 0,
          current_operation: "Completed",
        },
        timing: {
          started_at: row.started_at ? new Date(row.started_at) : undefined,
          completed_at: row.completed_at
            ? new Date(row.completed_at)
            : undefined,
        },
        error: row.error_message ? { message: row.error_message } : undefined,
      };
    } catch (error) {
      console.error("Failed to get job status:", error);
      return null;
    }
  }

  // Utility methods

  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getFileType(mimeType: string | undefined): string {
    if (!mimeType) return "unknown";

    const typeMap: Record<string, string> = {
      "application/vnd.google-apps.document": "google_doc",
      "application/vnd.google-apps.spreadsheet": "google_sheet",
      "application/vnd.google-apps.presentation": "google_slides",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        "docx",
      "application/msword": "doc",
      "application/pdf": "pdf",
      "text/plain": "text",
      "text/csv": "csv",
    };

    return typeMap[mimeType] || "other";
  }

  private async isDocumentProcessed(documentId: string): Promise<boolean> {
    try {
      const result = await sql`
        SELECT COUNT(*) as chunk_count
        FROM document_chunks
        WHERE document_id = ${documentId}
      `;
      return (result[0] as any).chunk_count > 0;
    } catch (error) {
      console.error("Failed to check if document is processed:", error);
      return false;
    }
  }

  private async getExistingChunks(
    documentId: string
  ): Promise<DocumentChunk[]> {
    try {
      const result = await sql`
        SELECT * FROM document_chunks
        WHERE document_id = ${documentId}
        ORDER BY position
      `;
      return result.map((row) => this.dbRowToChunk(row as any));
    } catch (error) {
      console.error("Failed to get existing chunks:", error);
      return [];
    }
  }

  private async cleanExistingChunks(
    projectId: string,
    documentId: string
  ): Promise<void> {
    try {
      // Delete from vector database
      await this.chromaService.deleteChunksByDocument(projectId, documentId);

      // Delete from database
      await sql`
        DELETE FROM document_chunks
        WHERE document_id = ${documentId}
      `;
    } catch (error) {
      console.error("Failed to clean existing chunks:", error);
      throw error;
    }
  }

  private async markDocumentAsProcessed(documentId: string): Promise<void> {
    try {
      await sql`
        UPDATE documents
        SET last_analyzed = CURRENT_TIMESTAMP
        WHERE id = ${documentId}
      `;
    } catch (error) {
      console.error("Failed to mark document as processed:", error);
    }
  }

  private createProcessingResult(
    jobId: string,
    chunks: DocumentChunk[],
    startTime: number
  ): ProcessingResult {
    return {
      job_id: jobId,
      chunks,
      metrics: {
        total_chunks: chunks.length,
        total_tokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
        average_chunk_size:
          chunks.length > 0
            ? chunks.reduce((sum, chunk) => sum + chunk.tokens, 0) /
              chunks.length
            : 0,
        processing_time_ms: Date.now() - startTime,
        semantic_coherence:
          chunks.length > 0
            ? chunks.reduce((sum, chunk) => sum + chunk.semantic_density, 0) /
              chunks.length
            : 0,
      },
    };
  }

  private dbRowToChunk(row: any): DocumentChunk {
    return {
      id: row.id,
      document_id: row.document_id,
      content: row.content,
      tokens: row.tokens,
      position: row.position,
      heading_path: row.heading_path || [],
      hierarchy_level: row.hierarchy_level || 0,
      parent_section_id: row.parent_section_id,
      chunk_type: row.chunk_type || "paragraph",
      semantic_density: row.semantic_density || 0,
      topic_keywords: row.topic_keywords || [],
      has_overlap_previous: row.has_overlap_previous || false,
      has_overlap_next: row.has_overlap_next || false,
      overlap_text: row.overlap_text,
      previous_chunk_id: row.previous_chunk_id,
      next_chunk_id: row.next_chunk_id,
      sibling_chunk_ids: row.sibling_chunk_ids || [],
      child_chunk_ids: row.child_chunk_ids || [],
      metadata: {
        created_at: new Date(row.created_at),
        source_file_id: row.source_file_id || "",
        source_file_name: row.source_file_name || "",
        chunking_method: row.chunking_method || "hybrid",
      },
    };
  }

  /**
   * Get event emitter for real-time updates
   */
  getEventEmitter() {
    return this.eventEmitter;
  }
}

// Singleton instance
let processorInstance: DocumentProcessor | null = null;

export function getDocumentProcessor(): DocumentProcessor {
  if (!processorInstance) {
    processorInstance = new DocumentProcessor();
  }
  return processorInstance;
}
