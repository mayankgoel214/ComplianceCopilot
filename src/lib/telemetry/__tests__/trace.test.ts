import { Trace, PRICING_USD_PER_MTOK } from "../trace";

const MODEL = "gemini-3.6-flash";

describe("Trace", () => {
  it("records a span and returns the wrapped value", async () => {
    const trace = new Trace();
    const value = await trace.record("classify", "generate", async () => ({
      value: { ok: true },
      inputTokens: 100,
      outputTokens: 50,
      model: MODEL,
    }));

    expect(value).toEqual({ ok: true });
    const summary = trace.summary();
    expect(summary.spans).toHaveLength(1);
    expect(summary.spans[0].name).toBe("classify");
    expect(summary.totals.inputTokens).toBe(100);
    expect(summary.totals.outputTokens).toBe(50);
  });

  it("prices generation from the published rate", async () => {
    const trace = new Trace();
    await trace.record("assess", "generate", async () => ({
      value: null,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: MODEL,
    }));

    const rate = PRICING_USD_PER_MTOK[MODEL];
    expect(trace.summary().totals.estimatedCostUsd).toBeCloseTo(rate.input + rate.output, 6);
  });

  it("records a span for a failed call and rethrows", async () => {
    const trace = new Trace();
    await expect(
      trace.record("assess", "generate", async () => {
        throw new Error("upstream exploded");
      })
    ).rejects.toThrow("upstream exploded");

    const summary = trace.summary();
    expect(summary.spans).toHaveLength(1);
    expect(summary.spans[0].error).toBe("upstream exploded");
  });

  it("counts embedding calls separately instead of folding them into the cost", async () => {
    const trace = new Trace();
    await trace.record("embed:query", "embed", async () => ({
      value: [0.1],
      inputTokens: null,
      outputTokens: null,
      model: "gemini-embedding-001",
    }));
    await trace.record("classify", "generate", async () => ({
      value: null,
      inputTokens: 10,
      outputTokens: 5,
      model: MODEL,
    }));

    const totals = trace.summary().totals;
    // The cost stays attributable — an unmetered embedding must not poison it.
    expect(totals.estimatedCostUsd).not.toBeNull();
    expect(totals.unpricedEmbeddingCalls).toBe(1);
  });

  it("refuses to report a cost when a generation call reported no usage", async () => {
    const trace = new Trace();
    await trace.record("classify", "generate", async () => ({
      value: null,
      inputTokens: null,
      outputTokens: null,
      model: MODEL,
    }));
    expect(trace.summary().totals.estimatedCostUsd).toBeNull();
  });

  it("refuses to report a cost for a model with no published rate", async () => {
    const trace = new Trace();
    await trace.record("classify", "generate", async () => ({
      value: null,
      inputTokens: 100,
      outputTokens: 100,
      model: "some-model-nobody-priced",
    }));
    expect(trace.summary().totals.estimatedCostUsd).toBeNull();
  });

  it("does not count local computation against the cost", async () => {
    const trace = new Trace();
    trace.add({
      name: "retrieve:HIPAA",
      kind: "retrieve",
      durationMs: 4,
      inputTokens: null,
      outputTokens: null,
      cached: false,
    });
    const totals = trace.summary().totals;
    expect(totals.estimatedCostUsd).toBe(0);
    expect(totals.unpricedEmbeddingCalls).toBe(0);
  });

  it("counts cached spans", async () => {
    const trace = new Trace();
    await trace.record("embed:query", "embed", async () => ({
      value: [0.1],
      cached: true,
      model: "gemini-embedding-001",
    }));
    const totals = trace.summary().totals;
    expect(totals.cachedSpans).toBe(1);
    // A cache hit made no call, so it is not an unpriced one either.
    expect(totals.unpricedEmbeddingCalls).toBe(0);
  });
});
