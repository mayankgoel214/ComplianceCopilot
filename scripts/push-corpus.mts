/**
 * Pushes the committed index into Postgres.
 *
 *   npx tsx --env-file=.env.local scripts/push-corpus.mts [--data DIR]
 *
 * Reads the same artifact the application serves from, so the two cannot
 * disagree about what the corpus contains: there is no second embedding pass
 * here and no second chunker, only a copy of `data/` into a table.
 *
 * The application still answers from the in-process index. This table is the
 * scale-out path — the thing that would carry a corpus too large to hold in a
 * lambda — and populating it is what keeps it from being aspirational.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import type { Chunk } from "../src/lib/retrieval/types";

interface IndexMeta {
  dimensions: number;
  chunkCount: number;
  sectionCount: number;
  embeddingModel: string;
}

const BATCH = 100;

function stringArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const dataDir = stringArg("data", "data");
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  const { meta, chunks } = JSON.parse(
    await readFile(path.join(dataDir, "corpus.json"), "utf8")
  ) as { meta: IndexMeta; chunks: Chunk[] };

  const buffer = await readFile(path.join(dataDir, "embeddings.f32.bin"));
  const matrix = new Float32Array(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  );

  const expected = chunks.length * meta.dimensions;
  if (matrix.length !== expected) {
    throw new Error(
      `Index is inconsistent: ${chunks.length} chunks x ${meta.dimensions} dims needs ${expected} floats, the vector file holds ${matrix.length}.`
    );
  }

  console.log(`${chunks.length} chunks, ${meta.dimensions}d ${meta.embeddingModel}`);

  let written = 0;
  for (let start = 0; start < chunks.length; start += BATCH) {
    const slice = chunks.slice(start, start + BATCH);
    const rows = slice.map((chunk, i) => {
      const offset = (start + i) * meta.dimensions;
      const vector = Array.from(matrix.subarray(offset, offset + meta.dimensions));
      return {
        id: chunk.id,
        framework: chunk.framework,
        citation: chunk.citation,
        heading: chunk.heading,
        source: chunk.source,
        source_url: chunk.sourceUrl,
        content: chunk.text,
        tokens: chunk.tokens,
        ordinal: chunk.ordinal,
        ordinal_of: chunk.ordinalOf,
        // pgvector's text input format. Passed as a string and cast, because
        // the driver has no native binding for the type.
        embedding: `[${vector.join(",")}]`,
      };
    });

    await sql`
      insert into corpus_chunks ${sql(
        rows,
        "id",
        "framework",
        "citation",
        "heading",
        "source",
        "source_url",
        "content",
        "tokens",
        "ordinal",
        "ordinal_of",
        "embedding"
      )}
      on conflict (id) do update set
        content   = excluded.content,
        heading   = excluded.heading,
        citation  = excluded.citation,
        embedding = excluded.embedding,
        tokens    = excluded.tokens
    `;

    written += slice.length;
    process.stdout.write(`\r  written ${written}/${chunks.length}`);
  }
  console.log();

  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from corpus_chunks`;
  const byFramework = await sql<{ framework: string; n: number }[]>`
    select framework, count(*)::int as n from corpus_chunks group by framework order by framework
  `;

  console.log(`\nin database: ${count} chunks`);
  for (const row of byFramework) console.log(`  ${row.framework.padEnd(28)} ${row.n}`);

  // A round trip that proves the vectors are queryable, not merely stored.
  const probe = Array.from(matrix.subarray(0, meta.dimensions));
  const [nearest] = await sql<{ citation: string; score: number }[]>`
    select citation, 1 - (embedding <=> ${`[${probe.join(",")}]`}::vector) as score
    from corpus_chunks order by embedding <=> ${`[${probe.join(",")}]`}::vector limit 1
  `;
  console.log(
    `\nnearest neighbour of chunk 0: ${nearest.citation} (cosine ${Number(nearest.score).toFixed(4)})`
  );
} catch (error) {
  console.error("\nfailed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
