import { assertDisposableDatabase } from "@/test-support/disposable-database";

describe("assertDisposableDatabase", () => {
  it("allows a local database named as disposable", () => {
    expect(() =>
      assertDisposableDatabase("postgres://postgres:verity@localhost:55433/verity_test")
    ).not.toThrow();
    expect(() =>
      assertDisposableDatabase("postgres://u:p@127.0.0.1:5432/test_scratch")
    ).not.toThrow();
  });

  it("refuses a database that does not name itself disposable", () => {
    // The real near-miss: another project's Postgres on the port the docs use.
    expect(() =>
      assertDisposableDatabase("postgres://postgres:verity@localhost:55432/pitchback")
    ).toThrow(/Refusing/);
    expect(() => assertDisposableDatabase("postgres://u:p@localhost:5432/verity")).toThrow(
      /Refusing/
    );
  });

  it("refuses anything that is not local, however it is named", () => {
    expect(() =>
      assertDisposableDatabase("postgres://u:p@ep-cool-name.neon.tech/verity_test")
    ).toThrow(/remote host/);
  });

  it("refuses a malformed url rather than assuming it is safe", () => {
    expect(() => assertDisposableDatabase("not a url")).toThrow();
  });
});
