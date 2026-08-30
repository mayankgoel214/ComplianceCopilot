/**
 * Integration test for the pgvector backend, against a real Postgres.
 *
 * Skipped unless `VERITY_TEST_DATABASE_URL` is set. Start one with:
 *
 *   docker run -d --name verity-pgvector-test \
 *     -e POSTGRES_PASSWORD=verity -e POSTGRES_DB=verity_test \
 *     -p 55433:5432 pgvector/pgvector:pg17
 *   export VERITY_TEST_DATABASE_URL=postgres://postgres:verity@localhost:55433/verity_test
 *
 * A mocked database would test that this file calls the functions this file
 * calls. The point of the test is the parts a mock cannot have an opinion
 * about: whether the vector literal parses, whether the generated tsvector
 * column is legal DDL, whether the HNSW index can be built on 768 dimensions,
 * and whether `<=>` orders the way the code assumes it does.
 */
import { Client } from "pg";

import { assertDisposableDatabase } from "@/test-support/disposable-database";

import { PgVectorStore, type SqlExecutor } from "../pgvector-store";
import type { Chunk } from "../types";

const DATABASE_URL = process.env.VERITY_TEST_DATABASE_URL;
if (DATABASE_URL) assertDisposableDatabase(DATABASE_URL);
const describeIfDatabase = DATABASE_URL ? describe : describe.skip;

const DIMENSIONS = 8;

function chunk(id: string, framework: string, citation: string, heading: string, text: string): Chunk {
  return {
    id,
    framework,
    citation,
    heading,
    source: "test source",
    sourceUrl: "https://example.invalid/",
    text,
    tokens: text.split(/\s+/).length,
    ordinal: 0,
    ordinalOf: 1,
  };
}

/** Unit-normalised so cosine distance behaves the way the production vectors do. */
function unit(values: number[]): number[] {
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return values.map((v) => v / norm);
}

describeIfDatabase("PgVectorStore against a real Postgres", () => {
  let client: Client;
  let store: PgVectorStore;

  const chunks: Chunk[] = [
    chunk("a", "HIPAA", "45 CFR 164.312", "Technical safeguards", "Implement encryption and decryption of electronic protected health information."),
    chunk("b", "HIPAA", "45 CFR 164.310", "Physical safeguards", "Implement policies limiting physical access to facilities and workstations."),
    chunk("c", "GDPR", "GDPR Article 32", "Security of processing", "The controller shall implement appropriate technical and organisational measures."),
  ];

  const vectors = new Float32Array([
    ...unit([1, 0, 0, 0, 0, 0, 0, 0]),
    ...unit([0, 1, 0, 0, 0, 0, 0, 0]),
    ...unit([0.9, 0.1, 0, 0, 0, 0, 0, 0]),
  ]);

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    const executor: SqlExecutor = {
      query: (text, values) => client.query(text, values as unknown[]),
    };
    store = new PgVectorStore(executor, { table: "verity_test_chunks", dimensions: DIMENSIONS });
    await store.drop();
    await store.migrate();
    await store.upsert(chunks, vectors);
  }, 60000);

  afterAll(async () => {
    if (store) await store.drop();
    if (client) await client.end();
  });

  it("writes every chunk", async () => {
    expect(await store.count()).toBe(3);
  });

  it("orders dense results by cosine similarity", async () => {
    const results = await store.denseSearch(unit([1, 0, 0, 0, 0, 0, 0, 0]), 3);
    expect(results.map((r) => r.chunk.id)).toEqual(["a", "c", "b"]);
    expect(results[0].score).toBeCloseTo(1, 5);
    expect(results[0].rank).toBe(1);
  });

  it("applies the framework filter", async () => {
    const results = await store.denseSearch(unit([1, 0, 0, 0, 0, 0, 0, 0]), 5, "GDPR");
    expect(results).toHaveLength(1);
    expect(results[0].chunk.framework).toBe("GDPR");
  });

  it("finds chunks lexically through the generated tsvector", async () => {
    const results = await store.lexicalSearch("physical access facilities", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk.id).toBe("b");
  });

  it("returns nothing lexically for a term that is absent", async () => {
    expect(await store.lexicalSearch("zeppelin", 5)).toHaveLength(0);
  });

  it("fuses both arms", async () => {
    const results = await store.hybridSearch(
      "encryption of health information",
      unit([1, 0, 0, 0, 0, 0, 0, 0]),
      3
    );
    expect(results.map((r) => r.chunk.id)).toContain("a");
    expect(results[0].rank).toBe(1);
  });

  it("upserts rather than duplicating on a second write", async () => {
    const revised = [{ ...chunks[0], text: "Revised technical safeguard text." }];
    await store.upsert(revised, vectors.slice(0, DIMENSIONS));
    expect(await store.count()).toBe(3);
    const results = await store.denseSearch(unit([1, 0, 0, 0, 0, 0, 0, 0]), 1);
    expect(results[0].chunk.text).toBe("Revised technical safeguard text.");
  });

  it("refuses a query vector of the wrong dimension", async () => {
    await expect(store.denseSearch([1, 0, 0], 3)).rejects.toThrow(/dimensions/);
  });

  it("refuses an unsafe table name", () => {
    const executor: SqlExecutor = { query: async () => ({ rows: [] }) };
    expect(() => new PgVectorStore(executor, { table: "a; DROP TABLE x", dimensions: 8 })).toThrow(
      /Unsafe table name/
    );
  });
});
