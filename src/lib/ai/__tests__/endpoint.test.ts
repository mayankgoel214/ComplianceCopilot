import { getModelBaseUrl, isUsingStubModel } from "../endpoint";

/**
 * The override that lets tests point at a stub is the one piece of this that
 * could do real harm. A stub answering a visitor would produce confident
 * nonsense with every log line saying success — the exact failure this project
 * exists to argue against — so the guard is tested as carefully as the feature.
 */
describe("getModelBaseUrl", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns the real endpoint when nothing is set", () => {
    delete process.env.VERITY_MODEL_BASE_URL;
    expect(getModelBaseUrl()).toBe("https://generativelanguage.googleapis.com/v1beta");
    expect(isUsingStubModel()).toBe(false);
  });

  it("accepts a loopback override outside production", () => {
    process.env.NODE_ENV = "test";
    process.env.VERITY_MODEL_BASE_URL = "http://localhost:4599";
    expect(getModelBaseUrl()).toBe("http://localhost:4599");
    expect(isUsingStubModel()).toBe(true);
  });

  it("strips a trailing slash so the path join stays correct", () => {
    process.env.NODE_ENV = "test";
    process.env.VERITY_MODEL_BASE_URL = "http://127.0.0.1:4599/";
    expect(getModelBaseUrl()).toBe("http://127.0.0.1:4599");
  });

  it("refuses to redirect a production build at a stub", () => {
    process.env.NODE_ENV = "production";
    process.env.VERITY_MODEL_BASE_URL = "http://localhost:4599";
    expect(() => getModelBaseUrl()).toThrow(/production build/);
  });

  it("refuses any host that is not loopback, however the build is labelled", () => {
    // The case that matters: not a typo, but an override pointed somewhere a
    // request would actually leave the machine.
    process.env.NODE_ENV = "test";
    for (const url of [
      "https://evil.example.com/v1beta",
      "http://169.254.169.254/latest",
      "https://generativelanguage.googleapis.com.evil.example/v1beta",
    ]) {
      process.env.VERITY_MODEL_BASE_URL = url;
      expect(() => getModelBaseUrl()).toThrow(/loopback/);
    }
  });

  it("refuses a malformed override rather than falling back to the real one", () => {
    // Falling back would be the dangerous kindness: the run would look like it
    // used the stub and would quietly bill a real account.
    process.env.NODE_ENV = "test";
    process.env.VERITY_MODEL_BASE_URL = "not-a-url";
    expect(() => getModelBaseUrl()).toThrow(/not a valid URL/);
  });
});
