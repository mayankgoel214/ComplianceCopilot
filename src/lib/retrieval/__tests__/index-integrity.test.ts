import { readFile } from "node:fs/promises";

import { RetrievalStore } from "../store";

/**
 * Checks the committed index itself, not the code that reads it.
 *
 * The artifact in `data/` is a build output that is checked in, which means it
 * can drift from the corpus and from the code without anything failing to
 * compile. These assertions are the thing that notices — a vector file that no
 * longer matches the chunk count, a chunk whose framework was renamed, a gold
 * citation that a re-chunk quietly removed.
 */
describe("the committed retrieval index", () => {
  let store: RetrievalStore;

  beforeAll(async () => {
    store = await RetrievalStore.load("data");
  });

  it("has vectors for exactly as many chunks as it has chunks", () => {
    // RetrievalStore.load throws on a mismatch, so reaching here is the
    // assertion; this restates it so a failure names the problem.
    expect(store.chunks).toHaveLength(store.meta.chunkCount);
    expect(store.meta.chunkCount).toBeGreaterThan(500);
  });

  it("is 768-dimensional, matching what the application configures", () => {
    expect(store.meta.dimensions).toBe(768);
    expect(store.meta.embeddingModel).toBe("gemini-embedding-001");
  });

  it("covers the six frameworks whose text can be redistributed", () => {
    expect([...store.meta.frameworks].sort()).toEqual([
      "ADA/Section 508",
      "Export Controls (EAR/ITAR)",
      "FERPA",
      "GDPR",
      "HIPAA",
      "IRB",
    ]);
  });

  it("gives every chunk a unique id", () => {
    expect(new Set(store.chunks.map((c) => c.id)).size).toBe(store.chunks.length);
  });

  it("gives every chunk non-empty text, a citation and a source URL", () => {
    for (const chunk of store.chunks) {
      expect(chunk.text.trim().length).toBeGreaterThan(0);
      expect(chunk.citation.trim().length).toBeGreaterThan(0);
      expect(chunk.sourceUrl).toMatch(/^https?:\/\//);
    }
  });

  it("keeps every chunk within a sane token range", () => {
    const oversized = store.chunks.filter((c) => c.tokens > store.meta.chunking.targetTokens + 80);
    expect(oversized).toHaveLength(0);
  });

  it("has a BM25 vocabulary consistent with a corpus this size", () => {
    expect(store.vocabularySize).toBeGreaterThan(2000);
  });

  it("contains every citation the gold set labels", async () => {
    const raw = await readFile("eval/gold-set.jsonl", "utf8");
    const queries = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { id: string; gold: string[] });

    const citations = new Set(store.chunks.map((c) => c.citation));
    const missing = queries.flatMap((q) =>
      q.gold.filter((g) => !citations.has(g)).map((g) => `${q.id} -> ${g}`)
    );

    expect(missing).toEqual([]);
  });

  it("has a gold set with unique ids and a usable split", async () => {
    const raw = await readFile("eval/gold-set.jsonl", "utf8");
    const queries = raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as { id: string; difficulty: string; gold: string[] });

    expect(new Set(queries.map((q) => q.id)).size).toBe(queries.length);
    for (const q of queries) expect(q.gold.length).toBeGreaterThan(0);

    const difficulties = new Set(queries.map((q) => q.difficulty));
    expect(difficulties).toContain("direct");
    expect(difficulties).toContain("paraphrased");
  });

  it("looks a chunk up by id", () => {
    const first = store.chunks[0];
    expect(store.getChunk(first.id)?.citation).toBe(first.citation);
    expect(store.getChunk("no-such-chunk")).toBeUndefined();
  });

  it("runs BM25 without needing a model, and filters by framework", async () => {
    // No embedder is reachable in a unit test, so the lexical arm is the one
    // that can be exercised end to end here.
    const noEmbedder = async () => {
      throw new Error("the dense arm must not be reached in this test");
    };
    const result = await store.search("encryption of protected health information", noEmbedder, {
      mode: "bm25",
      topK: 5,
      framework: "HIPAA",
    });
    expect(result.results.length).toBeGreaterThan(0);
    expect(result.results.every((r) => r.chunk.framework === "HIPAA")).toBe(true);
  });
});
