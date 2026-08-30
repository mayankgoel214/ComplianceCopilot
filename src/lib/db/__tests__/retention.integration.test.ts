/**
 * Retention, against a real Postgres.
 *
 * Skipped unless `VERITY_TEST_DATABASE_URL` is set — see the pgvector
 * integration test for the one-line Docker command.
 *
 * There is one thing here worth testing and it is not that expired rows are
 * deleted. It is that the pinned row is not. The front page links to a finished
 * report so a visitor can see the tool's output without spending a model call;
 * that link is served out of this table, and a retention sweep that treated it
 * like any other row would turn the front page's third button into a 404 thirty
 * days later — silently, and long after anyone was looking.
 */
import { Client } from "pg";

import { assertDisposableDatabase } from "@/test-support/disposable-database";

const DATABASE_URL = process.env.VERITY_TEST_DATABASE_URL;
if (DATABASE_URL) assertDisposableDatabase(DATABASE_URL);
const describeIfDatabase = DATABASE_URL ? describe : describe.skip;

describeIfDatabase("report retention", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    await client.query(`drop table if exists reports cascade`);
    await client.query(`
      create table reports (
        id            text primary key,
        document      text not null,
        document_hash text not null,
        result        jsonb not null,
        created_at    timestamptz not null default now(),
        expires_at    timestamptz not null default now() + interval '30 days',
        pinned        boolean not null default false
      )`);
    await client.query(`
      create or replace function purge_expired_reports() returns integer
      language sql as $$
        with deleted as (delete from reports where expires_at < now() and not pinned returning 1)
        select count(*)::integer from deleted;
      $$`);
  });

  afterAll(async () => {
    await client.query(`drop table if exists reports cascade`);
    await client.end();
  });

  beforeEach(async () => {
    await client.query(`delete from reports`);
  });

  /** `offset` is a Postgres interval applied to now(), e.g. "-1 day". */
  const insert = (id: string, offset: string, pinned = false) =>
    client.query(
      `insert into reports (id, document, document_hash, result, expires_at, pinned)
       values ($1, 'doc', 'hash', '{}'::jsonb, now() + $2::interval, $3)`,
      [id, offset, pinned]
    );

  it("deletes reports past their expiry", async () => {
    await insert("stale", "-1 day");
    await insert("fresh", "1 day");

    const { rows } = await client.query(`select purge_expired_reports() as n`);
    expect(rows[0].n).toBe(1);

    const left = await client.query(`select id from reports order by id`);
    expect(left.rows.map((r) => r.id)).toEqual(["fresh"]);
  });

  it("spares the pinned report even when it is long past expiry", async () => {
    // The condition that matters: expired *and* pinned. A sweep written as
    // `where expires_at < now()` passes the test above and deletes this row.
    await insert("sample", "-400 days", true);
    await insert("stale", "-1 day");

    const { rows } = await client.query(`select purge_expired_reports() as n`);
    expect(rows[0].n).toBe(1);

    const left = await client.query(`select id from reports`);
    expect(left.rows.map((r) => r.id)).toEqual(["sample"]);
  });

  it("still spares it after repeated sweeps", async () => {
    await insert("sample", "-400 days", true);
    for (let i = 0; i < 3; i++) await client.query(`select purge_expired_reports()`);
    const left = await client.query(`select count(*)::int as c from reports where pinned`);
    expect(left.rows[0].c).toBe(1);
  });
});
