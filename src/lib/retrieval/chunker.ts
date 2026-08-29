import { Chunk } from "./types";

export interface CorpusSection {
  framework: string;
  citation: string;
  heading: string;
  source: string;
  source_url: string;
  text: string;
}

export interface ChunkingConfig {
  /** Target chunk size, in tokens. */
  targetTokens: number;
  /** Tokens of trailing context repeated at the head of the next chunk. */
  overlapTokens: number;
  /** Sections shorter than this are emitted whole rather than split. */
  minTokens: number;
}

export const DEFAULT_CHUNKING: ChunkingConfig = {
  targetTokens: 320,
  overlapTokens: 64,
  minTokens: 32,
};

/**
 * Word count × 1.3.
 *
 * Regulation text tokenizes worse than prose — citation strings, subsection
 * letters and defined terms all split — so the usual 0.75 words-per-token rule
 * runs the wrong way here. This is an estimate used only to size chunks; the
 * exact count never leaves this module.
 */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Splits a section into chunks on paragraph boundaries.
 *
 * Regulations are written as numbered paragraphs, and a requirement almost
 * never spans two of them. Splitting mid-paragraph to hit an exact token target
 * would cut requirements in half for no gain, so a paragraph that overshoots
 * the target is kept whole; only a paragraph that overshoots on its own is
 * broken, and then on sentence boundaries.
 */
export function chunkSection(section: CorpusSection, config: ChunkingConfig = DEFAULT_CHUNKING): Chunk[] {
  const paragraphs = section.text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const units: string[] = [];
  for (const paragraph of paragraphs) {
    if (estimateTokens(paragraph) <= config.targetTokens) {
      units.push(paragraph);
      continue;
    }
    let buffer = "";
    for (const sentence of paragraph.split(/(?<=[.;:])\s+/)) {
      if (buffer && estimateTokens(`${buffer} ${sentence}`) > config.targetTokens) {
        units.push(buffer);
        buffer = sentence;
      } else {
        buffer = buffer ? `${buffer} ${sentence}` : sentence;
      }
    }
    if (buffer) units.push(buffer);
  }

  const bodies: string[] = [];
  let current: string[] = [];
  let currentTokens = 0;

  for (const unit of units) {
    const unitTokens = estimateTokens(unit);
    if (current.length > 0 && currentTokens + unitTokens > config.targetTokens) {
      bodies.push(current.join("\n"));

      // Carry the tail of the emitted chunk into the next one so a requirement
      // that straddles the boundary is retrievable from either side.
      const carry: string[] = [];
      let carryTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = estimateTokens(current[i]);
        if (carryTokens + t > config.overlapTokens) break;
        carry.unshift(current[i]);
        carryTokens += t;
      }
      current = [...carry];
      currentTokens = carryTokens;
    }
    current.push(unit);
    currentTokens += unitTokens;
  }
  if (current.length > 0) bodies.push(current.join("\n"));

  const nonEmpty = bodies.filter((b) => estimateTokens(b) >= config.minTokens);
  const finalBodies = nonEmpty.length > 0 ? nonEmpty : bodies.slice(0, 1);

  const base = `${slugify(section.framework)}:${slugify(section.citation)}`;
  return finalBodies.map((text, i) => ({
    id: `${base}:${i}`,
    framework: section.framework,
    citation: section.citation,
    heading: section.heading,
    source: section.source,
    sourceUrl: section.source_url,
    // The heading is prepended to the embedded text. A chunk from the middle of
    // a section otherwise carries no indication of what it is about, and a
    // dense retriever cannot recover that from the body alone.
    text,
    tokens: estimateTokens(text),
    ordinal: i,
    ordinalOf: finalBodies.length,
  }));
}

/** The string actually sent to the embedding model for a chunk. */
export function embeddingText(chunk: Chunk): string {
  return `${chunk.framework} — ${chunk.citation}\n${chunk.heading}\n\n${chunk.text}`;
}
