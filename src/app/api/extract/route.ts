import { NextResponse } from "next/server";

import {
  extractText,
  ExtractionFailedError,
  UnsupportedFileError,
  MAX_UPLOAD_BYTES,
} from "@/lib/documents/extract";
import { MAX_DOCUMENT_CHARS } from "@/lib/pipeline/assess";
import { EXTRACT_BUCKET, checkRateLimit, visitorKeyFrom } from "@/lib/demo/rate-limit";

/**
 * Turns an uploaded file into text.
 *
 * Deliberately separate from /api/assess. Extraction is cheap and local;
 * assessment is several model calls against a budget. Keeping them apart means
 * a visitor can upload, read what came out, and decide whether to spend one of
 * their three runs on it — rather than discovering after the fact that the
 * upload was a scan and the run was wasted.
 *
 * Nothing is stored. The text goes back to the browser and the buffer is
 * dropped; the file never reaches disk.
 */
export const maxDuration = 30;

export async function POST(request: Request) {
  const limit = checkRateLimit(visitorKeyFrom(request.headers), EXTRACT_BUCKET);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: limit.reason, retryAfterSeconds: limit.retryAfterSeconds },
      { status: 429 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the file as multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was attached." }, { status: 400 });
  }

  // Checked before reading the body into memory, so an oversized upload is
  // refused rather than buffered.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `That file is ${(file.size / 1e6).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1e6} MB.`,
      },
      { status: 413 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractText(buffer, file.name, file.type);

    // The assessment truncates anyway; saying so here means the number on the
    // page is the number that will actually be assessed.
    const truncated = extracted.chars > MAX_DOCUMENT_CHARS;

    return NextResponse.json({
      text: truncated ? extracted.text.slice(0, MAX_DOCUMENT_CHARS) : extracted.text,
      chars: truncated ? MAX_DOCUMENT_CHARS : extracted.chars,
      originalChars: extracted.chars,
      truncated,
      kind: extracted.kind,
      pages: extracted.pages,
      filename: file.name,
      warnings: extracted.warnings,
      uploadsRemainingThisHour: limit.remaining,
    });
  } catch (error) {
    if (error instanceof UnsupportedFileError || error instanceof ExtractionFailedError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("Extraction failed:", error);
    return NextResponse.json({ error: "That file could not be read." }, { status: 500 });
  }
}
