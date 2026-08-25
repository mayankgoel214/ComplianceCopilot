// pdf-parse ships no type declarations, so importing it was an implicit any.
// This describes only what text-extractor actually uses.
declare module "pdf-parse" {
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
