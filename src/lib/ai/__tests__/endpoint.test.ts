import { getModelBaseUrl, isUsingStubModel } from "../endpoint";

/**
 * The override that lets tests point at a stub is the one piece of this that
 * could do real harm. A stub answering a visitor would produce confident
 * nonsense with every log line saying success — the exact failure this project
 * exists to argue against — so the guard is tested as carefully as the feature.
 */
describe("getModelBaseUrl", () => {
  const env = (over: Record<string, string | undefined>): NodeJS.ProcessEnv =>
    ({ NODE_ENV: "test", ...over }) as NodeJS.ProcessEnv;

  it("returns the real endpoint when nothing is set", () => {
    expect(getModelBaseUrl(env({}))).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(isUsingStubModel(env({}))).toBe(false);
  });

  it("accepts a loopback override outside production", () => {
    const e = env({ VERITY_MODEL_BASE_URL: "http://localhost:4599" });
    expect(getModelBaseUrl(e)).toBe("http://localhost:4599");
    expect(isUsingStubModel(e)).toBe(true);
  });

  it("strips a trailing slash so the path join stays correct", () => {
    expect(getModelBaseUrl(env({ VERITY_MODEL_BASE_URL: "http://127.0.0.1:4599/" }))).toBe(
      "http://127.0.0.1:4599"
    );
  });

  it("refuses to redirect a production build at a stub", () => {
    expect(() =>
      getModelBaseUrl(
        env({ NODE_ENV: "production", VERITY_MODEL_BASE_URL: "http://localhost:4599" })
      )
    ).toThrow(/production build/);
  });

  it("allows it in a production build only behind the explicit escape hatch", () => {
    expect(
      getModelBaseUrl(
        env({
          NODE_ENV: "production",
          VERITY_MODEL_BASE_URL: "http://localhost:4599",
          VERITY_ALLOW_STUB_IN_PROD_BUILD: "1",
        })
      )
    ).toBe("http://localhost:4599");
  });

  it("refuses any host that is not loopback, however the build is labelled", () => {
    // The case that matters: not a typo, but an override pointed somewhere a
    // request would actually leave the machine.
    for (const url of [
      "https://evil.example.com/v1beta",
      "http://169.254.169.254/latest",
      "https://generativelanguage.googleapis.com.evil.example/v1beta",
    ]) {
      expect(() => getModelBaseUrl(env({ VERITY_MODEL_BASE_URL: url }))).toThrow(/loopback/);
    }
  });

  it("refuses a malformed override rather than falling back to the real one", () => {
    // Falling back would be the dangerous kindness: the run would look like it
    // used the stub and would quietly bill a real account.
    expect(() => getModelBaseUrl(env({ VERITY_MODEL_BASE_URL: "not-a-url" }))).toThrow(
      /not a valid URL/
    );
  });
});
