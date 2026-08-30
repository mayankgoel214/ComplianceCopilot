import { classifyFailure, toPublicFailure } from "../public-error";

/** The exact string that reached the public search endpoint during the outage. */
const REAL_LEAK =
  'Embedding request failed (429): {\n  "error": {\n    "code": 429,\n    "message": "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay. ",\n    "status": "RESOURCE_EXHAUSTED"\n  }\n}';

describe("classifyFailure", () => {
  it("recognises a depleted billing account", () => {
    expect(classifyFailure(new Error(REAL_LEAK))).toBe("model-budget");
  });

  it("separates being out of money from being rate-limited", () => {
    // Both are 429s. Only one of them is worth retrying, and telling a visitor
    // to try again in a minute when the account is empty is a lie.
    expect(classifyFailure(new Error("Gemini generateContent failed (429): rate limit"))).toBe(
      "model-busy"
    );
    expect(toPublicFailure(new Error(REAL_LEAK), "t").retryable).toBe(false);
    expect(
      toPublicFailure(new Error("failed (429): too many requests"), "t").retryable
    ).toBe(true);
  });

  it("recognises key problems", () => {
    expect(classifyFailure(new Error("API_KEY_INVALID"))).toBe("model-auth");
    expect(classifyFailure(new Error("request failed (403): PERMISSION_DENIED"))).toBe(
      "model-auth"
    );
  });

  it("recognises timeouts", () => {
    expect(classifyFailure(new Error("The operation timed out"))).toBe("model-timeout");
  });

  it("answers 'unknown' rather than guessing", () => {
    expect(classifyFailure(new Error("socket hang up"))).toBe("unknown");
    expect(classifyFailure("not even an error")).toBe("unknown");
    expect(classifyFailure(undefined)).toBe("unknown");
  });
});

describe("toPublicFailure", () => {
  const errors = [
    new Error(REAL_LEAK),
    new Error("API_KEY_INVALID: the key sk-abcdef123456 was rejected"),
    new Error("Gemini generateContent failed (500): internal, trace id 9f3a-internal-host"),
    new Error("connect ECONNREFUSED 10.0.3.12:443"),
  ];

  it("never puts upstream text in a message a client will see", () => {
    // The property, stated as a property rather than as four assertions about
    // four strings: nothing distinctive from the input survives into the
    // output. If a future classification is added by copying a branch and
    // interpolating the error, this fails.
    for (const error of errors) {
      const { message } = toPublicFailure(error, "test");
      for (const leaky of [
        "prepayment",
        "ai.studio",
        "sk-abcdef",
        "API_KEY",
        "ECONNREFUSED",
        "10.0.3.12",
        "9f3a",
        "429",
        "500",
      ]) {
        expect(message.toLowerCase()).not.toContain(leaky.toLowerCase());
      }
    }
  });

  it("logs the real error for an operator", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error(REAL_LEAK);
    toPublicFailure(error, "search:embed");
    expect(spy).toHaveBeenCalledWith("[search:embed] model-budget:", error);
    spy.mockRestore();
  });

  it("maps every kind to a sane status", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(toPublicFailure(new Error(REAL_LEAK), "t").status).toBe(503);
    expect(toPublicFailure(new Error("timed out"), "t").status).toBe(504);
    expect(toPublicFailure(new Error("socket hang up"), "t").status).toBe(500);
    spy.mockRestore();
  });
});
