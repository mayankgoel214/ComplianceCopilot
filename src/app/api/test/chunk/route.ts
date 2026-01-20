import { NextRequest, NextResponse } from "next/server";
import {
  SemanticChunker,
  ChunkingConfig,
} from "@/lib/processing/semantic-chunker";

// POST /api/test/chunk - Test semantic chunking with provided text
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, config = {} } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Content is required and must be a string" },
        { status: 400 }
      );
    }

    if (content.trim().length === 0) {
      return NextResponse.json(
        { error: "Content cannot be empty" },
        { status: 400 }
      );
    }

    // Check for extremely large documents and apply appropriate chunking strategy
    if (content.length > 100000) {
      // 100KB
      console.log(`Processing large document: ${content.length} characters`);
      // Use more aggressive chunking for very large documents
      config.max_chunk_size = Math.min(config.max_chunk_size || 500, 400);
      config.target_chunk_size = Math.min(config.target_chunk_size || 300, 350);
    }

    // Default chunking configuration
    const defaultConfig: ChunkingConfig = {
      min_chunk_size: 100,
      max_chunk_size: 500,
      target_chunk_size: 300,
      overlap_percentage: 10,
      prefer_semantic_boundaries: true,
      respect_section_boundaries: true,
      include_heading_context: true,
    };

    const finalConfig = { ...defaultConfig, ...config };

    // Create chunker and process content
    const chunker = new SemanticChunker();

    // Add timeout for large document processing
    const processWithTimeout = (timeout: number = 30000) => {
      return Promise.race([
        chunker.chunkDocument(
          content,
          "test-doc-" + Date.now(),
          "test-file-" + Date.now(),
          "test-content.md",
          finalConfig
        ),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Processing timeout")), timeout)
        ),
      ]);
    };

    const result = (await processWithTimeout(
      content.length > 100000 ? 60000 : 30000
    )) as any;

    // Transform chunks for response (add created_at as string)
    const responseChunks = result.chunks.map((chunk) => ({
      id: chunk.id,
      content: chunk.content,
      tokens: chunk.tokens,
      position: chunk.position,
      heading_path: chunk.heading_path,
      hierarchy_level: chunk.hierarchy_level,
      chunk_type: chunk.chunk_type,
      semantic_density: chunk.semantic_density,
      topic_keywords: chunk.topic_keywords,
      has_overlap_previous: chunk.has_overlap_previous,
      has_overlap_next: chunk.has_overlap_next,
      overlap_text: chunk.overlap_text,
      previous_chunk_id: chunk.previous_chunk_id,
      next_chunk_id: chunk.next_chunk_id,
      sibling_chunk_ids: chunk.sibling_chunk_ids,
      child_chunk_ids: chunk.child_chunk_ids,
      chunking_method: chunk.metadata.chunking_method,
      created_at: chunk.metadata.created_at.toISOString(),
      source_file_name: chunk.metadata.source_file_name,
    }));

    return NextResponse.json({
      success: true,
      chunks: responseChunks,
      total_chunks: result.total_chunks,
      total_tokens: result.total_tokens,
      average_chunk_size: result.average_chunk_size,
      semantic_coherence: result.semantic_coherence,
      hierarchy_preservation: result.hierarchy_preservation,
      overlap_efficiency: result.overlap_efficiency,
      processing_metadata: {
        input_length: content.length,
        config_used: finalConfig,
        processing_timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error in test chunking endpoint:", error);

    // Handle specific errors
    if (error instanceof Error) {
      if (error.message.includes("Processing timeout")) {
        return NextResponse.json(
          {
            error: "Processing timeout",
            details:
              "Document processing took too long. Try reducing document size or using smaller chunk sizes.",
            suggestions: [
              "Reduce document size",
              "Use smaller max_chunk_size",
              "Split document into smaller sections",
            ],
          },
          { status: 408 }
        );
      }

      if (error.message.includes("tokenizer")) {
        return NextResponse.json(
          {
            error: "Tokenization failed",
            details: "Error counting tokens in the provided text",
          },
          { status: 500 }
        );
      }

      if (
        error.message.includes("parse") ||
        error.message.includes("structure")
      ) {
        return NextResponse.json(
          {
            error: "Document parsing failed",
            details: "Error analyzing document structure",
          },
          { status: 500 }
        );
      }

      if (error.message.includes("semantic")) {
        return NextResponse.json(
          {
            error: "Semantic analysis failed",
            details: "Error in semantic boundary detection",
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Chunking failed",
        details:
          error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// GET /api/test/chunk - Get information about the chunking test endpoint
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/test/chunk",
    description: "Test endpoint for semantic chunking functionality",
    methods: ["POST"],
    parameters: {
      content: {
        type: "string",
        required: true,
        description: "Text content to be chunked",
      },
      config: {
        type: "object",
        required: false,
        description: "Chunking configuration options",
        properties: {
          min_chunk_size: {
            type: "number",
            default: 100,
            description: "Minimum tokens per chunk",
          },
          max_chunk_size: {
            type: "number",
            default: 500,
            description: "Maximum tokens per chunk",
          },
          target_chunk_size: {
            type: "number",
            default: 300,
            description: "Target tokens per chunk",
          },
          overlap_percentage: {
            type: "number",
            default: 10,
            description: "Percentage overlap between chunks",
          },
          prefer_semantic_boundaries: {
            type: "boolean",
            default: true,
            description: "Prefer semantic boundaries over structural ones",
          },
          respect_section_boundaries: {
            type: "boolean",
            default: true,
            description: "Never split across major sections",
          },
          include_heading_context: {
            type: "boolean",
            default: true,
            description: "Include parent headings in chunk context",
          },
        },
      },
    },
    example_request: {
      content: "# Example Document\n\nThis is sample content...",
      config: {
        max_chunk_size: 400,
        overlap_percentage: 15,
      },
    },
    response_format: {
      success: "boolean",
      chunks: "array of chunk objects",
      total_chunks: "number",
      total_tokens: "number",
      average_chunk_size: "number",
      semantic_coherence: "number (0-1)",
      hierarchy_preservation: "number (0-1)",
      overlap_efficiency: "number (0-1)",
    },
  });
}
