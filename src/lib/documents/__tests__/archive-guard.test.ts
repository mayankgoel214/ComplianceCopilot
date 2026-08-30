import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertSafeArchive,
  inspectZip,
  ArchiveRejected,
  MAX_EXPANDED_BYTES,
} from "../archive-guard";

/**
 * Builds a .docx-shaped zip with a body of the given size.
 *
 * Real archives, built with the system zip, because the whole point of this
 * guard is reading a real central directory. A hand-written fixture would only
 * prove the parser agrees with whoever wrote the fixture.
 */
function buildDocx(bodyBytes: number): Buffer {
  const dir = mkdtempSync(path.join(tmpdir(), "verity-zip-"));
  mkdirSync(path.join(dir, "word"), { recursive: true });
  writeFileSync(
    path.join(dir, "[Content_Types].xml"),
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'
  );
  writeFileSync(
    path.join(dir, "word", "document.xml"),
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>' +
      "A".repeat(bodyBytes) +
      "</w:t></w:r></w:p></w:body></w:document>"
  );

  const out = path.join(dir, "doc.docx");
  execFileSync("zip", ["-r", "-9", "-q", out, "[Content_Types].xml", "word"], { cwd: dir });
  return readFileSync(out);
}

describe("archive guard", () => {
  it("reads the declared uncompressed size out of the central directory", () => {
    const report = inspectZip(buildDocx(50_000));
    expect(report.entries).toBeGreaterThanOrEqual(2);
    expect(report.uncompressedBytes).toBeGreaterThan(50_000);
    expect(report.ratio).toBeGreaterThan(1);
  });

  it("accepts a document that compresses extremely well but is small", () => {
    // A hundred kilobytes of identical bytes compresses by orders of magnitude.
    // It is still a hundred kilobytes, so it is safe, and an earlier
    // compression-ratio rule rejected exactly this — which is why that rule is
    // gone.
    expect(() => assertSafeArchive(buildDocx(100_000))).not.toThrow();
  });

  it("refuses an archive that expands past the limit", () => {
    // 40 MB of body against a 24 MB ceiling: a few hundred KB on disk.
    expect(() => assertSafeArchive(buildDocx(40 * 1024 * 1024))).toThrow(ArchiveRejected);
    expect(() => assertSafeArchive(buildDocx(40 * 1024 * 1024))).toThrow(/expands to \d+ MB/);
  }, 30000);

  it("states the limit in whole megabytes rather than raw bytes", () => {
    try {
      assertSafeArchive(buildDocx(40 * 1024 * 1024));
      throw new Error("should have been refused");
    } catch (error) {
      expect((error as Error).message).toContain(`${MAX_EXPANDED_BYTES / 1024 / 1024} MB limit`);
      expect((error as Error).message).not.toMatch(/\d+\.\d{3,}/);
    }
  }, 30000);

  it("refuses something that is not a zip at all", () => {
    expect(() => inspectZip(Buffer.from("this is not a zip file, not even slightly"))).toThrow(
      ArchiveRejected
    );
  });

  it("refuses an archive whose directory does not parse", () => {
    // A valid end-of-central-directory record pointing at nothing.
    const buffer = Buffer.alloc(64);
    buffer.writeUInt32LE(0x06054b50, 40);
    buffer.writeUInt16LE(3, 50); // claims three entries
    buffer.writeUInt32LE(0, 56); // directory at offset zero, which is not one
    expect(() => inspectZip(buffer)).toThrow(/malformed/);
  });
});
