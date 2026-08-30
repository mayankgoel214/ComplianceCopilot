/**
 * A pre-flight check on uploaded archives.
 *
 * A .docx is a zip, and a zip declares how large each entry expands to. That
 * makes a compression bomb trivial: a 217 KB archive whose `document.xml`
 * unpacks to 200 MB parses in half a second and, measured, took this server
 * from 613 MB to 1,013 MB of resident memory. The upload cap was on the archive
 * and the truncation happened after extraction, so neither one saw it coming.
 * A handful of concurrent uploads would exhaust a serverless function.
 *
 * The fix is to read the central directory — which carries the uncompressed
 * size of every entry — and refuse the file before handing it to a parser.
 * That costs a few hundred bytes of reading and no allocation at all.
 *
 * Written out rather than pulled from a package because it is one record
 * format read backwards from the end of a buffer, and a zip parser is a large
 * surface to add for a check this small.
 */

/** Extracted text a document may legitimately expand to. */
export const MAX_EXPANDED_BYTES = 24 * 1024 * 1024;

export class ArchiveRejected extends Error {}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
// End-of-central-directory is 22 bytes plus a comment of up to 65,535.
const MAX_EOCD_SEARCH = 22 + 0xffff;

interface ArchiveReport {
  entries: number;
  compressedBytes: number;
  uncompressedBytes: number;
  ratio: number;
}

/**
 * Reads the central directory and totals what the archive claims to expand to.
 *
 * The declared sizes are attacker-controlled, so this is not a guarantee about
 * what a parser will actually allocate — it is a cheap filter that catches the
 * shape of the attack. An archive that lies downward about its size still has
 * to get past the parser, and the parser is bounded separately.
 */
export function inspectZip(buffer: Buffer): ArchiveReport {
  const start = Math.max(0, buffer.length - MAX_EOCD_SEARCH);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= start; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) {
    throw new ArchiveRejected("That file is not a readable Word document.");
  }

  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);

  let compressedBytes = 0;
  let uncompressedBytes = 0;
  let offset = directoryOffset;

  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) {
      throw new ArchiveRejected("That Word document's directory is malformed.");
    }
    compressedBytes += buffer.readUInt32LE(offset + 20);
    uncompressedBytes += buffer.readUInt32LE(offset + 24);

    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    entries,
    compressedBytes,
    uncompressedBytes,
    ratio: compressedBytes === 0 ? 0 : uncompressedBytes / compressedBytes,
  };
}

/**
 * Throws when an archive should not be handed to a parser.
 *
 * Only the absolute expanded size is checked. A compression-ratio rule was
 * written here first and removed: if the total expanded size is under the cap
 * the allocation is bounded whatever the ratio, so the rule could only ever
 * reject files that were already safe. The first test written against it
 * failed on a legitimate document — XML compresses extremely well, and a
 * boilerplate-heavy .docx can exceed any ratio worth setting.
 */
export function assertSafeArchive(buffer: Buffer): ArchiveReport {
  const report = inspectZip(buffer);

  if (report.uncompressedBytes > MAX_EXPANDED_BYTES) {
    throw new ArchiveRejected(
      `That Word document expands to ${Math.round(report.uncompressedBytes / 1024 / 1024)} MB of content, which is past the ${MAX_EXPANDED_BYTES / 1024 / 1024} MB limit. Verity reads documents, not archives.`
    );
  }

  return report;
}
