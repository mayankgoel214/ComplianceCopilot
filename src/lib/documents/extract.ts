/**
 * Text extraction from an uploaded file.
 *
 * Every parser is imported dynamically, inside the function that needs it.
 * That is not stylistic: this repository has already been taken down once by
 * importing `pdf-parse` at module scope. Version 1 ended its entry point with
 *
 *     let isDebugMode = !module.parent;
 *     if (isDebugMode) { Fs.readFileSync('./test/data/05-versions-space.pdf') }
 *
 * which ran on import under a bundler, threw ENOENT before any handler
 * executed, and took out every route that transitively reached the extractor —
 * including routes that never touch a PDF. Version 2 no longer does this, but
 * a parser that only loads when a file of its type arrives is the shape that
 * cannot cause that class of failure again.
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Enough text that the result is worth assessing rather than a scan artefact. */
const MIN_USEFUL_CHARS = 200;

export interface ExtractedDocument {
  text: string;
  chars: number;
  kind: "pdf" | "docx" | "text";
  /** Present for PDFs. */
  pages?: number;
  /** Things a reader should know about the extraction, not errors. */
  warnings: string[];
}

export class UnsupportedFileError extends Error {}
export class ExtractionFailedError extends Error {}

const PDF_TYPES = new Set(["application/pdf"]);
const DOCX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const TEXT_TYPES = new Set([
  "text/plain",
  "text/markdown",
  "text/x-markdown",
  "application/json",
  "",
]);

function kindFor(filename: string, mimeType: string): ExtractedDocument["kind"] {
  const name = filename.toLowerCase();
  // The extension is trusted over the browser-supplied MIME type, which is
  // routinely wrong or empty and is attacker-controlled either way. Neither is
  // a security boundary here — the parsers are chosen by it, and both are
  // given a bounded buffer regardless.
  if (name.endsWith(".pdf") || PDF_TYPES.has(mimeType)) return "pdf";
  if (name.endsWith(".docx") || DOCX_TYPES.has(mimeType)) return "docx";
  if (/\.(txt|md|markdown|json|csv)$/.test(name) || TEXT_TYPES.has(mimeType)) return "text";

  throw new UnsupportedFileError(
    `Verity reads PDF, Word (.docx), and plain text. It cannot read ${filename || "that file"}.`
  );
}

/** Collapses the ragged whitespace PDF extraction produces. */
function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ExtractedDocument> {
  if (buffer.byteLength === 0) {
    throw new ExtractionFailedError("That file is empty.");
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new ExtractionFailedError(
      `That file is ${(buffer.byteLength / 1e6).toFixed(1)} MB. The limit is ${MAX_UPLOAD_BYTES / 1e6} MB.`
    );
  }

  const kind = kindFor(filename, mimeType);
  const warnings: string[] = [];
  let text = "";
  let pages: number | undefined;

  if (kind === "pdf") {
    // pdf-parse v2 is a different library from v1 behind the same name: a
    // PDFParse class over pdfjs, not a `pdf(buffer)` function. The parser holds
    // worker resources, so it is destroyed in a finally rather than left to the
    // garbage collector on a long-lived serverless instance.
    const { PDFParse } = await import("pdf-parse");

    // pdfjs insists on a worker even in Node, and resolves it by path. Under a
    // bundler that path does not exist, and the failure surfaces as "Setting up
    // fake worker failed" from inside the parse rather than at import — so it
    // looks like a broken PDF rather than a missing file. Pointing it at the
    // copy that ships inside pdf-parse fixes it; next.config.ts traces that
    // file for this route so it is present in the deployment too.
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    try {
      PDFParse.setWorker(require.resolve("pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs"));
    } catch {
      // Left to pdfjs's own resolution if the package layout ever moves. A
      // wrong guess here should not stop a parse that might have worked.
    }

    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const parsed = await parser.getText();
      text = tidy(parsed.text ?? "");
      pages = parsed.total;
    } catch (error) {
      throw new ExtractionFailedError(
        `That PDF could not be read: ${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}`
      );
    } finally {
      await parser.destroy().catch(() => {
        // A parser that will not shut down is not a reason to fail a request
        // whose text was already extracted.
      });
    }

    if (text.length < MIN_USEFUL_CHARS) {
      // A scanned PDF is images of text. Saying so is more use than handing the
      // model an empty string and letting it find nothing.
      throw new ExtractionFailedError(
        "That PDF contains almost no selectable text. It is probably a scan, and Verity does not do OCR — paste the text instead."
      );
    }
  } else if (kind === "docx") {
    const mammoth = await import("mammoth");
    try {
      const result = await mammoth.extractRawText({ buffer });
      text = tidy(result.value ?? "");
      // mammoth reports unconvertible elements. They are worth surfacing but
      // are not failures.
      for (const message of result.messages.slice(0, 3)) {
        warnings.push(message.message);
      }
    } catch (error) {
      throw new ExtractionFailedError(
        `That Word file could not be read: ${error instanceof Error ? error.message.slice(0, 160) : "unknown error"}`
      );
    }
  } else {
    text = tidy(buffer.toString("utf8"));
    // A binary file renamed .txt decodes to replacement characters. Catch that
    // rather than sending mojibake to a model.
    const replacementRatio =
      (text.match(/�/g)?.length ?? 0) / Math.max(text.length, 1);
    if (replacementRatio > 0.02) {
      throw new ExtractionFailedError(
        "That file does not look like text. Verity reads PDF, Word (.docx), and plain text."
      );
    }
  }

  if (text.length < MIN_USEFUL_CHARS) {
    throw new ExtractionFailedError(
      `Only ${text.length} characters came out of that file, which is too little to assess.`
    );
  }

  return { text, chars: text.length, kind, pages, warnings };
}
