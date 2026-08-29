import { verifyQuote, verifyClaims } from "../verify";

const SOURCE = `
Implement a mechanism to encrypt and decrypt electronic protected health
information. A covered entity must retain the documentation required by this
section for six years from the date of its creation or the date when it last
was in effect, whichever is later.
`;

describe("verifyQuote", () => {
  it("marks a verbatim quote as exact", () => {
    const result = verifyQuote("retain the documentation required by this section for six years", [SOURCE]);
    expect(result.verdict).toBe("exact");
    expect(result.similarity).toBe(1);
    expect(result.offset).not.toBeNull();
  });

  it("ignores differences in whitespace and line breaks", () => {
    const result = verifyQuote("encrypt   and\n\ndecrypt electronic protected health information", [SOURCE]);
    expect(result.verdict).toBe("exact");
  });

  it("ignores case", () => {
    expect(verifyQuote("ENCRYPT AND DECRYPT ELECTRONIC PROTECTED HEALTH", [SOURCE]).verdict).toBe("exact");
  });

  it("folds typographic quotes and dashes the model substitutes", () => {
    const source = "The term “covered entity” means a health plan — see the definition.";
    const result = verifyQuote('The term "covered entity" means a health plan - see the definition.', [source]);
    expect(result.verdict).toBe("exact");
  });

  it("marks a lightly reworded quote as near rather than exact", () => {
    const result = verifyQuote("retain documentation required by section for six years from date", [SOURCE]);
    expect(result.verdict).toBe("near");
    expect(result.similarity).toBeGreaterThanOrEqual(0.75);
    expect(result.similarity).toBeLessThan(1);
  });

  it("marks an invented quote as unsupported", () => {
    const result = verifyQuote(
      "Covered entities must appoint a Chief Blockchain Officer within thirty days.",
      [SOURCE]
    );
    expect(result.verdict).toBe("unsupported");
  });

  it("does not accept words scattered across the source as a quotation", () => {
    // Every one of these words appears in the source, but never together.
    const result = verifyQuote("encrypt six creation covered mechanism whichever", [SOURCE]);
    expect(result.verdict).toBe("unsupported");
  });

  it("rejects a quote too short to verify", () => {
    expect(verifyQuote("six years", [SOURCE]).verdict).toBe("unsupported");
  });

  it("rejects an empty quote", () => {
    expect(verifyQuote("", [SOURCE]).verdict).toBe("unsupported");
  });

  it("checks every candidate source, not only the first", () => {
    const result = verifyQuote("encrypt and decrypt electronic protected health information", [
      "An unrelated passage about facility access controls.",
      SOURCE,
    ]);
    expect(result.verdict).toBe("exact");
  });

  it("returns unsupported when there are no sources at all", () => {
    expect(verifyQuote("encrypt and decrypt electronic protected health", []).verdict).toBe("unsupported");
  });

  it("handles a quote longer than the source without crashing", () => {
    const result = verifyQuote(SOURCE.repeat(3), ["short source text here"]);
    expect(result.verdict).toBe("unsupported");
    expect(Number.isFinite(result.similarity)).toBe(true);
  });
});

describe("verifyClaims", () => {
  it("counts each verdict and computes the grounded rate", () => {
    const report = verifyClaims(
      [
        { claim: { id: 1 }, quote: "encrypt and decrypt electronic protected health information" },
        { claim: { id: 2 }, quote: "retain documentation required by section for six years from date" },
        { claim: { id: 3 }, quote: "Appoint a Chief Blockchain Officer within thirty days of onboarding." },
      ],
      [SOURCE]
    );

    expect(report.totals).toEqual({
      total: 3,
      exact: 1,
      near: 1,
      unsupported: 1,
      groundedRate: 2 / 3,
    });
  });

  it("preserves the claim payload alongside its verdict", () => {
    const report = verifyClaims([{ claim: { id: 7 }, quote: "nothing like the source at all here" }], [SOURCE]);
    expect(report.claims[0].claim).toEqual({ id: 7 });
  });

  it("treats an empty batch as fully grounded rather than dividing by zero", () => {
    const report = verifyClaims([], [SOURCE]);
    expect(report.totals.groundedRate).toBe(1);
    expect(report.totals.total).toBe(0);
  });
});
