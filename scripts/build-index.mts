/**
 * Builds the retrieval artifact the application and the evaluation harness both
 * load: chunk the corpus, embed every chunk, write metadata and vectors.
 *
 *   npx tsx scripts/build-index.mts [--target-tokens N] [--overlap-tokens N] [--out DIR]
 *
 * The tunable chunking parameters are flags rather than constants so the
 * chunking experiment in the evaluation report is a matter of rerunning this,
 * not of editing source.
 */
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  chunkSection,
  embeddingText,
  DEFAULT_CHUNKING,
  type CorpusSection,
} from "../src/lib/retrieval/chunker";
import { EmbeddingCache } from "../src/lib/retrieval/embedding-cache";
import type { Chunk } from "../src/lib/retrieval/types";
import { AI_CONFIG } from "../src/lib/ai/config";

const CORPUS_DIR = "corpus";
const CACHE_FILE = ".embedding-cache/corpus.json";
const BATCH_SIZE = 50;

function numberArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  if (!Number.isFinite(v)) throw new Error(`--${name} needs a number`);
  return v;
}

function stringArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

async function loadCorpus(): Promise<CorpusSection[]> {
  const files = (await readdir(CORPUS_DIR)).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) {
    throw new Error(`No .jsonl files in ${CORPUS_DIR}. Run: node scripts/fetch-corpus.mjs`);
  }
  const sections: CorpusSection[] = [];
  for (const file of files.sort()) {
    const raw = await readFile(path.join(CORPUS_DIR, file), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      sections.push(JSON.parse(line) as CorpusSection);
    }
  }
  return sections;
}

async function embedAll(chunks: Chunk[]): Promise<Float32Array> {
  const { model, dimensions } = AI_CONFIG.embeddings;
  const cache = new EmbeddingCache(CACHE_FILE, model, dimensions);
  await cache.load();

  const texts = chunks.map(embeddingText);
  const vectors: (number[] | undefined)[] = texts.map((t) => cache.get(t));
  const missing = vectors.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);

  console.log(
    `  ${texts.length - missing.length} of ${texts.length} chunks served from the embedding cache`
  );

  if (missing.length > 0) {
    // Imported lazily: the module reads the API key at construction, and a
    // fully cached build should not require one.
    const { getGeminiEmbeddingService } = await import("../src/lib/ai/gemini-embeddings");
    const service = getGeminiEmbeddingService();

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const slice = missing.slice(i, i + BATCH_SIZE);
      const batch = slice.map((idx) => texts[idx]);
      const upper = Math.min(i + BATCH_SIZE, missing.length);
      process.stdout.write(`  embedding ${i + 1}-${upper} of ${missing.length} ... `);
      const embedded = await service.generateDocumentEmbeddings(batch);
      if (embedded.length !== slice.length) {
        throw new Error(
          `Embedding batch returned ${embedded.length} vectors for ${slice.length} texts`
        );
      }
      slice.forEach((idx, j) => {
        vectors[idx] = embedded[j];
        cache.set(texts[idx], embedded[j]);
      });
      await cache.flush();
      console.log("ok");
    }
  }

  const matrix = new Float32Array(chunks.length * dimensions);
  vectors.forEach((vector, i) => {
    if (!vector) throw new Error(`Chunk ${chunks[i].id} has no embedding`);
    if (vector.length !== dimensions) {
      throw new Error(
        `Chunk ${chunks[i].id} embedded to ${vector.length} dimensions, expected ${dimensions}`
      );
    }
    // Re-normalise so cosine similarity is a plain dot product downstream. The
    // model returns unit vectors already; this makes that a guarantee rather
    // than an assumption about someone else's service.
    let norm = 0;
    for (const v of vector) norm += v * v;
    norm = Math.sqrt(norm);
    if (!Number.isFinite(norm) || norm === 0) {
      throw new Error(`Chunk ${chunks[i].id} embedded to a zero or non-finite vector`);
    }
    for (let d = 0; d < dimensions; d++) matrix[i * dimensions + d] = vector[d] / norm;
  });

  return matrix;
}

async function main() {
  const config = {
    targetTokens: numberArg("target-tokens", DEFAULT_CHUNKING.targetTokens),
    overlapTokens: numberArg("overlap-tokens", DEFAULT_CHUNKING.overlapTokens),
    minTokens: DEFAULT_CHUNKING.minTokens,
  };
  const outDir = stringArg("out", "data");

  console.log(
    `Building index (target ${config.targetTokens} tokens, overlap ${config.overlapTokens}) -> ${outDir}/`
  );

  const sections = await loadCorpus();
  console.log(`  ${sections.length} corpus sections`);

  const chunks = sections.flatMap((s) => chunkSection(s, config));
  console.log(`  ${chunks.length} chunks`);

  const ids = new Set<string>();
  for (const c of chunks) {
    if (ids.has(c.id)) throw new Error(`Duplicate chunk id: ${c.id}`);
    ids.add(c.id);
  }

  const matrix = await embedAll(chunks);

  await mkdir(outDir, { recursive: true });
  const meta = {
    builtFrom: "corpus/*.jsonl",
    embeddingModel: AI_CONFIG.embeddings.model,
    dimensions: AI_CONFIG.embeddings.dimensions,
    chunking: config,
    sectionCount: sections.length,
    chunkCount: chunks.length,
    frameworks: [...new Set(chunks.map((c) => c.framework))].sort(),
  };

  await writeFile(path.join(outDir, "corpus.json"), JSON.stringify({ meta, chunks }), "utf8");
  await writeFile(path.join(outDir, "embeddings.f32.bin"), Buffer.from(matrix.buffer));

  const tokens = chunks.map((c) => c.tokens).sort((a, b) => a - b);
  const p = (q: number) => tokens[Math.floor(tokens.length * q)];
  console.log(
    `\n  chunk tokens: min ${tokens[0]}, median ${p(0.5)}, p95 ${p(0.95)}, max ${tokens[tokens.length - 1]}`
  );
  console.log(
    `  wrote ${outDir}/corpus.json and ${outDir}/embeddings.f32.bin (${(matrix.byteLength / 1e6).toFixed(2)} MB)`
  );
}

main().catch((err) => {
  console.error("\nindex build failed:", err.message);
  process.exit(1);
});
