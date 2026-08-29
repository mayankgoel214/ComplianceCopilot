import type { Chunk, ScoredChunk } from "./types";
import { reciprocalRankFusion, DEFAULT_FUSION_WEIGHTS, type FusionWeights } from "./fusion";

/**
 * A Postgres/pgvector backend for the same retrieval interface.
 *
 * The shipped application does not use this: the corpus is around a thousand
 * passages, an exhaustive scan of a flat matrix answers in a millisecond, and
 * adding a database to that would be a moving part bought with nothing. This
 * exists for the corpus that outgrows the in-process index — tens of thousands
 * of passages, or a per-tenant corpus that cannot be baked into the build.
 *
 * It is written against a real Postgres and exercised by an integration test
 * that starts one in Docker (`src/lib/retrieval/__tests__/pgvector.integration.test.ts`),
 * because a persistence layer that has never met a database is not a
 * persistence layer. That is the mistake this project made once already, with
 * a ChromaDB client pointed at a localhost that production never had.
 *
 * The lexical arm is `ts_rank_cd` over a generated tsvector rather than the
 * BM25 implemented in `bm25.ts`. Postgres full-text ranking is not BM25 — it
 * has no document-length normalisation — so the two arms are not identical and
 * the difference is stated rather than glossed over.
 */

/** The minimum shape this store needs; satisfied by `@neondatabase/serverless`
 *  and by `pg`'s query interface alike, so the caller chooses the driver. */
export interface SqlExecutor {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface PgVectorConfig {
  table?: string;
  dimensions: number;
}

const DEFAULT_TABLE = "corpus_chunks";

export class PgVectorStore {
  private readonly table: string;
  private readonly dimensions: number;

  constructor(
    private readonly sql: SqlExecutor,
    config: PgVectorConfig
  ) {
    // Interpolated into DDL and queries, so it must not come from user input.
    if (config.table && !/^[a-z_][a-z0-9_]*$/.test(config.table)) {
      throw new Error(`Unsafe table name: ${config.table}`);
    }
    this.table = config.table ?? DEFAULT_TABLE;
    this.dimensions = config.dimensions;
  }

  /**
   * Creates the extension, table and indexes.
   *
   * The tsvector column is generated rather than maintained by a trigger, so it
   * cannot drift out of sync with the content it indexes. The vector index is
   * HNSW with cosine ops, matching the normalised vectors the build produces.
   */
  async migrate(): Promise<void> {
    await this.sql.query("CREATE EXTENSION IF NOT EXISTS vector");
    await this.sql.query(`
      CREATE TABLE IF NOT EXISTS ${this.table} (
        id            TEXT PRIMARY KEY,
        framework     TEXT NOT NULL,
        citation      TEXT NOT NULL,
        heading       TEXT NOT NULL,
        source        TEXT NOT NULL,
        source_url    TEXT NOT NULL,
        content       TEXT NOT NULL,
        tokens        INTEGER NOT NULL,
        ordinal       INTEGER NOT NULL,
        ordinal_of    INTEGER NOT NULL,
        embedding     VECTOR(${this.dimensions}) NOT NULL,
        content_tsv   TSVECTOR GENERATED ALWAYS AS (
                        to_tsvector('english', heading || ' ' || content)
                      ) STORED
      )
    `);
    await this.sql.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_tsv_idx ON ${this.table} USING GIN (content_tsv)`
    );
    await this.sql.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_framework_idx ON ${this.table} (framework)`
    );
    // HNSW build is the expensive part of the migration; it is created last so
    // a failure leaves a usable table rather than a half-built index.
    await this.sql.query(
      `CREATE INDEX IF NOT EXISTS ${this.table}_embedding_idx
         ON ${this.table} USING hnsw (embedding vector_cosine_ops)`
    );
  }

  /** Upserts chunks and their vectors. Rows are written in batches because a
   *  single statement with a thousand 768-dimension literals exceeds what the
   *  parser will accept. */
  async upsert(chunks: Chunk[], vectors: Float32Array, batchSize = 100): Promise<number> {
    if (vectors.length !== chunks.length * this.dimensions) {
      throw new Error(
        `Expected ${chunks.length * this.dimensions} floats for ${chunks.length} chunks, got ${vectors.length}`
      );
    }

    let written = 0;
    for (let start = 0; start < chunks.length; start += batchSize) {
      const slice = chunks.slice(start, start + batchSize);
      const values: unknown[] = [];
      const rows: string[] = [];

      slice.forEach((chunk, i) => {
        const globalIndex = start + i;
        const offset = globalIndex * this.dimensions;
        const vector = Array.from(vectors.subarray(offset, offset + this.dimensions));
        const base = values.length;
        values.push(
          chunk.id,
          chunk.framework,
          chunk.citation,
          chunk.heading,
          chunk.source,
          chunk.sourceUrl,
          chunk.text,
          chunk.tokens,
          chunk.ordinal,
          chunk.ordinalOf,
          `[${vector.join(",")}]`
        );
        const p = (n: number) => `$${base + n}`;
        rows.push(
          `(${p(1)}, ${p(2)}, ${p(3)}, ${p(4)}, ${p(5)}, ${p(6)}, ${p(7)}, ${p(8)}, ${p(9)}, ${p(10)}, ${p(11)}::vector)`
        );
      });

      await this.sql.query(
        `INSERT INTO ${this.table}
           (id, framework, citation, heading, source, source_url, content, tokens, ordinal, ordinal_of, embedding)
         VALUES ${rows.join(", ")}
         ON CONFLICT (id) DO UPDATE SET
           content = EXCLUDED.content,
           heading = EXCLUDED.heading,
           embedding = EXCLUDED.embedding,
           tokens = EXCLUDED.tokens`,
        values
      );
      written += slice.length;
    }
    return written;
  }

  async count(): Promise<number> {
    const { rows } = await this.sql.query(`SELECT COUNT(*)::int AS n FROM ${this.table}`);
    return Number(rows[0]?.n ?? 0);
  }

  private toScored(rows: Record<string, unknown>[], scoreKey: string): ScoredChunk[] {
    return rows.map((row, i) => ({
      chunk: {
        id: String(row.id),
        framework: String(row.framework),
        citation: String(row.citation),
        heading: String(row.heading),
        source: String(row.source),
        sourceUrl: String(row.source_url),
        text: String(row.content),
        tokens: Number(row.tokens),
        ordinal: Number(row.ordinal),
        ordinalOf: Number(row.ordinal_of),
      },
      score: Number(row[scoreKey]),
      rank: i + 1,
    }));
  }

  /** Cosine similarity via the `<=>` distance operator, so the HNSW index applies. */
  async denseSearch(queryVector: number[], topK: number, framework?: string): Promise<ScoredChunk[]> {
    if (queryVector.length !== this.dimensions) {
      throw new Error(
        `Query vector has ${queryVector.length} dimensions; the table is ${this.dimensions}`
      );
    }
    const values: unknown[] = [`[${queryVector.join(",")}]`];
    let where = "";
    if (framework) {
      values.push(framework);
      where = `WHERE framework = $${values.length}`;
    }
    values.push(topK);

    const { rows } = await this.sql.query(
      `SELECT id, framework, citation, heading, source, source_url, content, tokens, ordinal, ordinal_of,
              1 - (embedding <=> $1::vector) AS score
         FROM ${this.table}
         ${where}
        ORDER BY embedding <=> $1::vector
        LIMIT $${values.length}`,
      values
    );
    return this.toScored(rows, "score");
  }

  /** Lexical arm. `websearch_to_tsquery` is used so a bare phrase does not have
   *  to be pre-tokenised into tsquery syntax by the caller. */
  async lexicalSearch(query: string, topK: number, framework?: string): Promise<ScoredChunk[]> {
    const values: unknown[] = [query];
    let where = "WHERE content_tsv @@ websearch_to_tsquery('english', $1)";
    if (framework) {
      values.push(framework);
      where += ` AND framework = $${values.length}`;
    }
    values.push(topK);

    const { rows } = await this.sql.query(
      `SELECT id, framework, citation, heading, source, source_url, content, tokens, ordinal, ordinal_of,
              ts_rank_cd(content_tsv, websearch_to_tsquery('english', $1)) AS score
         FROM ${this.table}
         ${where}
        ORDER BY score DESC
        LIMIT $${values.length}`,
      values
    );
    return this.toScored(rows, "score");
  }

  async hybridSearch(
    query: string,
    queryVector: number[],
    topK: number,
    framework?: string,
    weights: FusionWeights = DEFAULT_FUSION_WEIGHTS
  ): Promise<ScoredChunk[]> {
    const candidateK = Math.max(topK * 5, 50);
    const [dense, lexical] = await Promise.all([
      this.denseSearch(queryVector, candidateK, framework),
      this.lexicalSearch(query, candidateK, framework),
    ]);
    return reciprocalRankFusion(dense, lexical, topK, weights).map(({ chunk, score, rank }) => ({
      chunk,
      score,
      rank,
    }));
  }

  async drop(): Promise<void> {
    await this.sql.query(`DROP TABLE IF EXISTS ${this.table}`);
  }
}
