/**
 * Applies src/lib/db/schema.sql.
 *
 *   npx tsx --env-file=.env.local scripts/db-migrate.mts
 *
 * The file is idempotent, so this is safe to re-run and there is no migration
 * ledger to keep honest. That holds only while the schema is additive; the day
 * a column has to change type, this needs to become numbered migrations rather
 * than one file, and pretending otherwise then would be the mistake.
 */
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  process.stdout.write("applying src/lib/db/schema.sql ... ");
  await sql.unsafe(await readFile("src/lib/db/schema.sql", "utf8"));
  console.log("ok");

  const tables = await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  const indexes = await sql<{ indexname: string }[]>`
    select indexname from pg_indexes where schemaname = 'public' order by indexname
  `;
  const [{ installed_version }] = await sql<{ installed_version: string }[]>`
    select installed_version from pg_available_extensions where name = 'vector'
  `;

  console.log(`\npgvector: ${installed_version}`);
  console.log(`tables:   ${tables.map((t) => t.table_name).join(", ")}`);
  console.log(`indexes:  ${indexes.length}`);
} catch (error) {
  console.error("\nfailed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
