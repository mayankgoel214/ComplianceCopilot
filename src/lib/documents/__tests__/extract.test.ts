import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  extractText,
  ExtractionFailedError,
  UnsupportedFileError,
  MAX_UPLOAD_BYTES,
} from "../extract";

/**
 * The PDF and DOCX cases parse real files rather than fixtures with mocked
 * parsers, because the failures worth catching here all live inside the
 * parsers: pdfjs resolving a worker it cannot find, mammoth choking on a
 * document part. A mocked parser has an opinion about none of that.
 *
 * The files are generated with macOS's own converters, so the suite carries no
 * committed binaries and the PDF is a genuine one rather than a hand-written
 * stub. Where those tools are absent, those two tests skip and the rest still
 * run.
 */
const SAMPLE = [
  "DATA MANAGEMENT PLAN — Project AETHER",
  "",
  "Student identifiers, enrolment records and course grades are held in a",
  "PostgreSQL database on university infrastructure. Clinical measurements",
  "collected during the study are stored in the same database, in adjacent",
  "tables, with no separation of duties between the research and registrar",
  "schemas. Access is granted to researchers on request by email to the PI.",
  "There is no formal review step and no periodic recertification.",
].join("\n");

const dir = mkdtempSync(path.join(tmpdir(), "verity-extract-"));
const txtPath = path.join(dir, "sample.txt");
writeFileSync(txtPath, SAMPLE, "utf8");

function convert(to: "pdf" | "docx"): Buffer | null {
  const out = path.join(dir, `sample.${to}`);
  try {
    if (to === "docx") {
      execFileSync("textutil", ["-convert", "docx", txtPath, "-output", out], { stdio: "ignore" });
    } else {
      const pdf = execFileSync("cupsfilter", [txtPath], { stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8e6 });
      writeFileSync(out, pdf);
    }
    return existsSync(out) ? readFileSync(out) : null;
  } catch {
    return null;
  }
}

const pdfBuffer = convert("pdf");
const docxBuffer = convert("docx");

describe("extractText", () => {
  it("reads plain text", async () => {
    const result = await extractText(Buffer.from(SAMPLE, "utf8"), "plan.txt", "text/plain");
    expect(result.kind).toBe("text");
    expect(result.text).toContain("Project AETHER");
    expect(result.chars).toBe(result.text.length);
  });

  it("reads markdown as text", async () => {
    const result = await extractText(Buffer.from(SAMPLE, "utf8"), "plan.md", "");
    expect(result.kind).toBe("text");
  });

  it("collapses the ragged whitespace extraction produces", async () => {
    const messy = `${SAMPLE}\n\n\n\n   lots     of    space   \n\n\n`;
    const result = await extractText(Buffer.from(messy, "utf8"), "plan.txt", "text/plain");
    expect(result.text).not.toMatch(/\n{3,}/);
    expect(result.text).not.toMatch(/ {2,}/);
    expect(result.text).toBe(result.text.trim());
  });

  (pdfBuffer ? it : it.skip)("reads a real PDF, worker and all", async () => {
    const result = await extractText(pdfBuffer!, "plan.pdf", "application/pdf");
    expect(result.kind).toBe("pdf");
    expect(result.pages).toBeGreaterThanOrEqual(1);
    expect(result.text).toContain("Project AETHER");
    expect(result.text).toContain("PostgreSQL");
  }, 30000);

  (docxBuffer ? it : it.skip)("reads a real .docx", async () => {
    const result = await extractText(
      docxBuffer!,
      "plan.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(result.kind).toBe("docx");
    expect(result.text).toContain("Project AETHER");
  }, 30000);

  it("picks the parser from the extension when the browser sends no MIME type", async () => {
    const result = await extractText(Buffer.from(SAMPLE, "utf8"), "PLAN.TXT", "");
    expect(result.kind).toBe("text");
  });

  it("refuses a file type it cannot read", async () => {
    await expect(
      extractText(Buffer.from(SAMPLE, "utf8"), "diagram.png", "image/png")
    ).rejects.toBeInstanceOf(UnsupportedFileError);
  });

  it("refuses an empty file", async () => {
    await expect(extractText(Buffer.alloc(0), "plan.txt", "text/plain")).rejects.toBeInstanceOf(
      ExtractionFailedError
    );
  });

  it("refuses a file over the size cap", async () => {
    const big = Buffer.alloc(MAX_UPLOAD_BYTES + 1, 0x41);
    await expect(extractText(big, "plan.txt", "text/plain")).rejects.toThrow(/limit is/);
  });

  it("refuses text too short to be worth assessing", async () => {
    await expect(
      extractText(Buffer.from("too short", "utf8"), "plan.txt", "text/plain")
    ).rejects.toThrow(/too little to assess/);
  });

  it("refuses binary content renamed to .txt rather than returning mojibake", async () => {
    // A PNG header followed by noise: decodes to replacement characters.
    const binary = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(4000, 0xff),
    ]);
    await expect(extractText(binary, "plan.txt", "text/plain")).rejects.toThrow(
      /does not look like text/
    );
  });

  it("refuses a PDF with no selectable text instead of returning an empty string", async () => {
    // Structurally a PDF, containing no text objects — the shape a scan has.
    const emptyPdf = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
        "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
        "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n" +
        "trailer<</Root 1 0 R>>\n%%EOF",
      "latin1"
    );
    await expect(extractText(emptyPdf, "scan.pdf", "application/pdf")).rejects.toBeInstanceOf(
      ExtractionFailedError
    );
  }, 30000);
});
