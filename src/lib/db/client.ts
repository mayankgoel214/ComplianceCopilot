import postgres from "postgres";

/**
 * The Postgres connection.
 *
 * One client per process, against Neon's pooled endpoint. Serverless instances
 * open and discard connections constantly, so `max: 1` here plus the pooler on
 * their side is what keeps a burst of cold starts from exhausting the
 * connection limit — a direct endpoint with a larger pool would be the wrong
 * shape for this runtime in both directions at once.
 *
 * Absent configuration is not an error. Verity's core — retrieval, the
 * playground, the evaluation — works with no database at all, and only saved
 * reports need one. `isConfigured` lets a caller degrade rather than crash.
 */

let client: postgres.Sql | null = null;

export const isDatabaseConfigured = Boolean(process.env.DATABASE_URL);

export function db(): postgres.Sql {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set, so nothing can be saved or read.");
  }
  if (!client) {
    client = postgres(process.env.DATABASE_URL, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 10,
      onnotice: () => {},
    });
  }
  return client;
}
