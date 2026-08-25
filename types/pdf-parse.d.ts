// pdf-parse ships no type declarations, so importing it was an implicit any.
// This describes only what text-extractor actually uses.
//
// Declared for the deep path rather than the package root. The root index.js
// runs a debug branch on import — see the comment in text-extractor.ts — so
// nothing here should import "pdf-parse" directly.
declare module "pdf-parse/lib/pdf-parse.js" {
  interface PDFInfo {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
    text: string;
  }

  function pdfParse(
    dataBuffer: Buffer | Uint8Array,
    options?: { max?: number; version?: string }
  ): Promise<PDFInfo>;

  export = pdfParse;
}
