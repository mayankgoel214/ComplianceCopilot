import { Trace } from "../trace";

/**
 * A trace summary is returned to the browser next to the results, so it is a
 * response body like any other. This is a regression test with a story: the
 * route handlers were fixed to stop echoing upstream errors, and the trace kept
 * publishing the very same string through a field nobody thought of as an
 * output. Fixing one did nothing for the other.
 */
describe("Trace does not publish upstream error text", () => {
  const UPSTREAM =
    'Embedding request failed (429): {"error":{"code":429,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage billing."}}';

  it("records a classification instead of the provider's message", async () => {
    const trace = new Trace();

    await expect(
      trace.record("embed:query", "embed", async () => {
        throw new Error(UPSTREAM);
      })
    ).rejects.toThrow(UPSTREAM); // the caller still gets the real error

    const published = JSON.stringify(trace.summary());
    for (const leaky of ["prepayment", "ai.studio", "429", "billing"]) {
      expect(published.toLowerCase()).not.toContain(leaky);
    }
    expect(published).toContain("model-budget");
  });
});
