import {
  ASSESS_BUCKET,
  SEARCH_BUCKET,
  checkRateLimit,
  visitorKeyFrom,
  __resetRateLimitsForTests,
} from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    __resetRateLimitsForTests();
  });

  it("allows a first-time visitor and counts down the remaining allowance", () => {
    const first = checkRateLimit("1.2.3.4", ASSESS_BUCKET);
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(ASSESS_BUCKET.perVisitorLimit - 1);
  });

  it("refuses the visitor once they exhaust the per-visitor limit", () => {
    for (let i = 0; i < ASSESS_BUCKET.perVisitorLimit; i++) {
      expect(checkRateLimit("1.2.3.4", ASSESS_BUCKET).allowed).toBe(true);
    }
    const refused = checkRateLimit("1.2.3.4", ASSESS_BUCKET);
    expect(refused.allowed).toBe(false);
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("meters visitors independently", () => {
    for (let i = 0; i < ASSESS_BUCKET.perVisitorLimit; i++) checkRateLimit("1.1.1.1", ASSESS_BUCKET);
    expect(checkRateLimit("1.1.1.1", ASSESS_BUCKET).allowed).toBe(false);
    expect(checkRateLimit("2.2.2.2", ASSESS_BUCKET).allowed).toBe(true);
  });

  it("keeps the buckets separate, so exhausting one leaves the other usable", () => {
    for (let i = 0; i < ASSESS_BUCKET.perVisitorLimit; i++) checkRateLimit("9.9.9.9", ASSESS_BUCKET);
    expect(checkRateLimit("9.9.9.9", ASSESS_BUCKET).allowed).toBe(false);
    expect(checkRateLimit("9.9.9.9", SEARCH_BUCKET).allowed).toBe(true);
  });

  it("enforces the global daily ceiling across every visitor", () => {
    const tiny = {
      name: "tiny",
      perVisitorLimit: 100,
      perVisitorWindowMs: 60_000,
      globalDailyLimit: 3,
    };
    expect(checkRateLimit("a", tiny).allowed).toBe(true);
    expect(checkRateLimit("b", tiny).allowed).toBe(true);
    expect(checkRateLimit("c", tiny).allowed).toBe(true);

    const refused = checkRateLimit("d", tiny);
    expect(refused.allowed).toBe(false);
    // Asserts that a refusal explains itself rather than asserting an exact
    // sentence, so rewording the copy is not a test failure.
    expect(refused.reason).toBeTruthy();
    expect(refused.reason!.length).toBeGreaterThan(40);
  });

  it("lets the visitor through again once their window has passed", () => {
    const brief = {
      name: "brief",
      perVisitorLimit: 1,
      perVisitorWindowMs: 1,
      globalDailyLimit: 100,
    };
    expect(checkRateLimit("x", brief).allowed).toBe(true);

    const later = Date.now() + 1000;
    const realNow = Date.now;
    Date.now = () => later;
    try {
      expect(checkRateLimit("x", brief).allowed).toBe(true);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("visitorKeyFrom", () => {
  it("takes the first entry of x-forwarded-for, since later entries are proxies a caller can forge", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" });
    expect(visitorKeyFrom(headers)).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip", () => {
    expect(visitorKeyFrom(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("returns a constant when there is no address at all, so callers are metered rather than exempt", () => {
    expect(visitorKeyFrom(new Headers())).toBe("unknown");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.4" });
    expect(visitorKeyFrom(headers)).toBe("203.0.113.9");
  });
});
