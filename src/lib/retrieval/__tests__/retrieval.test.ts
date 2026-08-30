import { BM25Index } from "../bm25";
import { DenseIndex, quantizeInt8, dequantize } from "../vectors";
import { reciprocalRankFusion } from "../fusion";
import { tokenize } from "../tokenizer";
import { chunkSection, estimateTokens, embeddingText, DEFAULT_CHUNKING } from "../chunker";
import type { Chunk, ScoredChunk } from "../types";

function makeChunk(id: string, heading: string, text: string, framework = "HIPAA"): Chunk {
  return {
    id,
    framework,
    citation: `cite-${id}`,
    heading,
    source: "test",
    sourceUrl: "https://example.invalid/",
    text,
    tokens: estimateTokens(text),
    ordinal: 0,
    ordinalOf: 1,
  };
}

describe("tokenize", () => {
  it("drops stopwords but keeps modal verbs that change a requirement's meaning", () => {
    const tokens = tokenize("The entity shall not disclose the record");
    expect(tokens).toContain("shall");
    expect(tokens).toContain("not");
    expect(tokens).not.toContain("the");
  });

  it("keeps citation forms together", () => {
    expect(tokenize("see 164.308 for details")).toContain("164.308");
  });

  it("collapses plurals onto their singular", () => {
    expect(tokenize("records")).toEqual(tokenize("record"));
  });

  it("is identical for the same text regardless of case or punctuation", () => {
    expect(tokenize("Access Controls!")).toEqual(tokenize("access, controls"));
  });
});

describe("BM25Index", () => {
  const chunks = [
    makeChunk("a", "Technical safeguards", "Encryption of electronic protected health information at rest."),
    makeChunk("b", "Physical safeguards", "Facility access controls limit physical entry to workstations."),
    makeChunk("c", "Documentation", "Retain policies for six years from the date of creation."),
  ];
  const index = new BM25Index(chunks);

  it("indexes every chunk", () => {
    expect(index.size).toBe(3);
    expect(index.vocabularySize).toBeGreaterThan(10);
  });

  it("ranks the chunk containing the query terms first", () => {
    const results = index.search("encryption at rest", 3);
    expect(results[0].chunk.id).toBe("a");
    expect(results[0].rank).toBe(1);
  });

  it("matches on the heading as well as the body", () => {
    const results = index.search("physical safeguards", 3);
    expect(results[0].chunk.id).toBe("b");
  });

  it("returns nothing for a query with no indexed term", () => {
    expect(index.search("zeppelin", 5)).toHaveLength(0);
  });

  it("returns nothing for an empty query", () => {
    expect(index.search("   ", 5)).toHaveLength(0);
  });

  it("honours the filter predicate", () => {
    const mixed = new BM25Index([
      makeChunk("a", "Encryption", "Encryption of health information.", "HIPAA"),
      makeChunk("b", "Encryption", "Encryption of personal data.", "GDPR"),
    ]);
    const results = mixed.search("encryption", 5, (c) => c.framework === "GDPR");
    expect(results).toHaveLength(1);
    expect(results[0].chunk.framework).toBe("GDPR");
  });

  it("assigns contiguous ranks starting at 1", () => {
    const results = index.search("access controls policies", 3);
    expect(results.map((r) => r.rank)).toEqual(results.map((_, i) => i + 1));
  });

  it("never assigns a negative score to a term present in every document", () => {
    const common = new BM25Index([
      makeChunk("a", "H", "shall shall shall"),
      makeChunk("b", "H", "shall"),
    ]);
    for (const result of common.search("shall", 5)) {
      expect(result.score).toBeGreaterThan(0);
    }
  });
});

describe("DenseIndex", () => {
  const chunks = [makeChunk("a", "A", "a"), makeChunk("b", "B", "b"), makeChunk("c", "C", "c")];
  const matrix = new Float32Array([1, 0, 0, 1, 0.8, 0.6]);
  const index = new DenseIndex(chunks, matrix, 2);

  it("orders by cosine similarity", () => {
    const results = index.search(Float32Array.from([1, 0]), 3);
    expect(results.map((r) => r.chunk.id)).toEqual(["a", "c", "b"]);
  });

  it("refuses a query vector of the wrong dimension", () => {
    expect(() => index.search(Float32Array.from([1, 0, 0]), 1)).toThrow(/dimensions/);
  });

  it("refuses a matrix whose size does not match the chunk count", () => {
    expect(() => new DenseIndex(chunks, new Float32Array([1, 0]), 2)).toThrow(/needs/);
  });

  it("honours the filter predicate", () => {
    const results = index.search(Float32Array.from([1, 0]), 3, (c) => c.id !== "a");
    expect(results.map((r) => r.chunk.id)).toEqual(["c", "b"]);
  });

  it("scores a query as cosine similarity even when the query is not unit length", () => {
    // Gemini does not return unit-length query vectors — measured, about 0.59 —
    // while the corpus vectors are normalised at build time. Without
    // normalising the query the dot product is |q| times the cosine, which is
    // what the retrieval playground used to display.
    const unit = index.search(Float32Array.from([1, 0]), 1)[0];
    const scaled = index.search(Float32Array.from([0.593, 0]), 1)[0];

    expect(scaled.chunk.id).toBe(unit.chunk.id);
    expect(scaled.score).toBeCloseTo(unit.score, 6);
    expect(scaled.score).toBeCloseTo(1, 6);
  });

  it("ranks identically whether or not the query is normalised", () => {
    // The corollary, and the reason the evaluation numbers did not move when
    // the normalisation was added: scaling by a positive constant preserves
    // order.
    const a = index.search(Float32Array.from([0.8, 0.6]), 3).map((r) => r.chunk.id);
    const b = index.search(Float32Array.from([0.08, 0.06]), 3).map((r) => r.chunk.id);
    expect(a).toEqual(b);
  });

  it("does not turn a zero query into NaN scores", () => {
    const results = index.search(new Float32Array([0, 0]), 3);
    expect(results.every((r) => Number.isFinite(r.score))).toBe(true);
  });
});

describe("int8 quantization", () => {
  it("round-trips within the quantization step", () => {
    const original = new Float32Array([0.5, -0.25, 1, -1, 0.125, 0, 0.75, -0.5]);
    const restored = dequantize(quantizeInt8(original, 8));
    for (let i = 0; i < original.length; i++) {
      expect(Math.abs(restored[i] - original[i])).toBeLessThan(1 / 127 + 1e-6);
    }
  });

  it("uses one scale per vector rather than one for the whole matrix", () => {
    const q = quantizeInt8(new Float32Array([1, 0, 0.01, 0]), 2);
    expect(q.scales).toHaveLength(2);
    expect(q.scales[0]).not.toBeCloseTo(q.scales[1]);
  });

  it("preserves the ranking of a small index", () => {
    const chunks = [makeChunk("a", "A", "a"), makeChunk("b", "B", "b"), makeChunk("c", "C", "c")];
    const matrix = new Float32Array([1, 0, 0, 1, 0.8, 0.6]);
    const exact = new DenseIndex(chunks, matrix, 2).search(Float32Array.from([1, 0]), 3);
    const quantized = new DenseIndex(chunks, dequantize(quantizeInt8(matrix, 2)), 2).search(
      Float32Array.from([1, 0]),
      3
    );
    expect(quantized.map((r) => r.chunk.id)).toEqual(exact.map((r) => r.chunk.id));
  });

  it("does not produce NaN for a zero vector", () => {
    const restored = dequantize(quantizeInt8(new Float32Array([0, 0]), 2));
    expect([...restored].every(Number.isFinite)).toBe(true);
  });
});

describe("reciprocalRankFusion", () => {
  const scored = (ids: string[]): ScoredChunk[] =>
    ids.map((id, i) => ({ chunk: makeChunk(id, id, id), score: 1 - i * 0.1, rank: i + 1 }));

  it("rewards a chunk both arms ranked highly", () => {
    const fused = reciprocalRankFusion(scored(["a", "b", "c"]), scored(["c", "a", "b"]), 3);
    expect(fused[0].chunk.id).toBe("a");
  });

  it("records which arm contributed each result", () => {
    const fused = reciprocalRankFusion(scored(["a"]), scored(["b"]), 2);
    const a = fused.find((f) => f.chunk.id === "a")!;
    expect(a.contributions.denseRank).toBe(1);
    expect(a.contributions.bm25Rank).toBeUndefined();
  });

  it("collapses to the dense ranking when the lexical arm is weighted zero", () => {
    const dense = scored(["a", "b", "c"]);
    const lexical = scored(["c", "b", "a"]);
    const fused = reciprocalRankFusion(dense, lexical, 3, { dense: 1, lexical: 0 });
    expect(fused.map((f) => f.chunk.id)).toEqual(["a", "b", "c"]);
  });

  it("lets a weighted lexical arm change the order", () => {
    const dense = scored(["a", "b"]);
    const lexical = scored(["b", "a"]);
    const heavy = reciprocalRankFusion(dense, lexical, 2, { dense: 0, lexical: 1 });
    expect(heavy[0].chunk.id).toBe("b");
  });

  it("returns at most topK results", () => {
    expect(reciprocalRankFusion(scored(["a", "b", "c", "d"]), scored(["e"]), 2)).toHaveLength(2);
  });

  it("does not duplicate a chunk that both arms returned", () => {
    const fused = reciprocalRankFusion(scored(["a", "b"]), scored(["a", "b"]), 10);
    expect(fused).toHaveLength(2);
  });
});

describe("chunkSection", () => {
  const section = {
    framework: "HIPAA",
    citation: "45 CFR 164.312",
    heading: "Technical safeguards",
    source: "test",
    source_url: "https://example.invalid/",
    text: Array.from({ length: 12 }, (_, i) => `Paragraph ${i} ${"word ".repeat(40)}`).join("\n"),
  };

  it("splits a long section into several chunks", () => {
    const chunks = chunkSection(section);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("keeps chunks near the token target", () => {
    for (const c of chunkSection(section)) {
      expect(c.tokens).toBeLessThanOrEqual(DEFAULT_CHUNKING.targetTokens + 60);
    }
  });

  it("gives every chunk a unique id and a consistent ordinal count", () => {
    const chunks = chunkSection(section);
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    expect(chunks.every((c) => c.ordinalOf === chunks.length)).toBe(true);
  });

  it("emits a short section as a single chunk", () => {
    const chunks = chunkSection({ ...section, text: "One short paragraph of regulation text here." });
    expect(chunks).toHaveLength(1);
  });

  it("never returns zero chunks for a section with any content", () => {
    expect(chunkSection({ ...section, text: "Tiny." }).length).toBeGreaterThan(0);
  });

  it("overlaps adjacent chunks so a straddling requirement is retrievable from either side", () => {
    const chunks = chunkSection(section);
    const first = new Set(chunks[0].text.split("\n"));
    const overlapping = chunks[1].text.split("\n").filter((p) => first.has(p));
    expect(overlapping.length).toBeGreaterThan(0);
  });

  it("prefixes the framework, citation and heading onto the embedded text", () => {
    const [chunk] = chunkSection({ ...section, text: "Body text of the section." });
    const embedded = embeddingText(chunk);
    expect(embedded).toContain("45 CFR 164.312");
    expect(embedded).toContain("Technical safeguards");
    expect(embedded).toContain("Body text");
  });

  it("splits an oversized single paragraph on sentence boundaries", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} with several words in it.`).join(" ");
    const chunks = chunkSection({ ...section, text: long });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].text).toMatch(/\.$/);
  });
});
