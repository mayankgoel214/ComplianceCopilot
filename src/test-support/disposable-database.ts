/**
 * A refusal, so an integration test cannot drop somebody else's tables.
 *
 * These tests do destructive DDL — `drop table if exists ... cascade` — against
 * whatever `VERITY_TEST_DATABASE_URL` points at. That is fine when it points at
 * a throwaway container and catastrophic when it does not, and the gap between
 * those two cases is one stale environment variable.
 *
 * This is not hypothetical. The documented setup publishes the test container
 * on port 55432; by the time these tests were next run, that port on this
 * machine belonged to an unrelated project's Postgres. The connection was
 * refused only because the passwords happened to differ. Had the project used
 * the same throwaway password these docs suggest, the test would have dropped
 * its tables and reported a pass.
 *
 * So: the database must name itself as disposable, and it must be local. Both
 * conditions, and a loud failure rather than a skip — a silent skip is how you
 * end up believing tests ran.
 */
export function assertDisposableDatabase(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("VERITY_TEST_DATABASE_URL is not a valid URL.");
  }

  const database = parsed.pathname.replace(/^\//, "");

  if (!/(^|[_-])test(s)?([_-]|$)|_test$|^test/i.test(database)) {
    throw new Error(
      `Refusing to run destructive tests against database "${database}". ` +
        `The name must mark it as disposable (e.g. "verity_test"). ` +
        `This guard exists because port 55432 on this machine has already been ` +
        `reassigned to an unrelated project once.`
    );
  }

  const host = parsed.hostname;
  const isLocal =
    host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0";
  if (!isLocal) {
    throw new Error(
      `Refusing to run destructive tests against remote host "${host}". ` +
        `Integration tests run against a local throwaway container only.`
    );
  }
}
