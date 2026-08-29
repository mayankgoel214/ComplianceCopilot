/**
 * Spend limits for the public endpoints.
 *
 * Every public call here reaches a real model on a real billing account, so
 * this is a cost control before it is anything else. Two ceilings, because they
 * fail differently: the per-visitor one stops somebody holding down a button,
 * and the global one bounds the bill if a link gets shared widely.
 *
 * Buckets are separate because the endpoints cost different amounts. An
 * assessment is several generation calls over a long prompt; a search is one
 * embedding call. Charging them against the same allowance would either make
 * search uselessly scarce or make assessment dangerously cheap.
 *
 * State is in memory, which means it resets on cold start and is per-instance.
 * That is a real weakness and the right fix is a shared store — but for public
 * endpoints nobody is signed in to, an imperfect ceiling is much better than
 * none, and the alternative is a Redis dependency for a demo page.
 */

export interface BucketConfig {
  name: string;
  perVisitorLimit: number;
  perVisitorWindowMs: number;
  globalDailyLimit: number;
}

export const ASSESS_BUCKET: BucketConfig = {
  name: "assess",
  perVisitorLimit: 3,
  perVisitorWindowMs: 60 * 60 * 1000,
  globalDailyLimit: 100,
};

export const SEARCH_BUCKET: BucketConfig = {
  name: "search",
  perVisitorLimit: 40,
  perVisitorWindowMs: 60 * 60 * 1000,
  globalDailyLimit: 2000,
};

/** File extraction costs CPU and memory but no model call, so it is metered
 *  generously — the point of the limit is to stop a script, not a person who
 *  has several documents to try. */
export const EXTRACT_BUCKET: BucketConfig = {
  name: "extract",
  perVisitorLimit: 30,
  perVisitorWindowMs: 60 * 60 * 1000,
  globalDailyLimit: 1000,
};

/** Retrieval playground runs that include the LLM reranker cost a generation
 *  call each, so they are metered separately from plain retrieval. */
export const RERANK_BUCKET: BucketConfig = {
  name: "rerank",
  perVisitorLimit: 10,
  perVisitorWindowMs: 60 * 60 * 1000,
  globalDailyLimit: 300,
};

interface VisitorRecord {
  count: number;
  windowStartedAt: number;
}

interface BucketState {
  visitors: Map<string, VisitorRecord>;
  globalCount: number;
  globalWindowStartedAt: number;
}

const buckets = new Map<string, BucketState>();

function stateFor(config: BucketConfig): BucketState {
  let state = buckets.get(config.name);
  if (!state) {
    state = { visitors: new Map(), globalCount: 0, globalWindowStartedAt: Date.now() };
    buckets.set(config.name, state);
  }
  return state;
}

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  remaining: number;
}

/** Keeps the visitor map from growing without bound on a long-lived instance. */
function evictExpired(state: BucketState, config: BucketConfig, now: number): void {
  for (const [key, record] of state.visitors) {
    if (now - record.windowStartedAt > config.perVisitorWindowMs) {
      state.visitors.delete(key);
    }
  }
}

export function checkRateLimit(
  visitorKey: string,
  config: BucketConfig = ASSESS_BUCKET
): RateLimitResult {
  const now = Date.now();
  const state = stateFor(config);

  if (now - state.globalWindowStartedAt > 24 * 60 * 60 * 1000) {
    state.globalCount = 0;
    state.globalWindowStartedAt = now;
  }

  if (state.globalCount >= config.globalDailyLimit) {
    const retryAfterSeconds = Math.ceil(
      (state.globalWindowStartedAt + 24 * 60 * 60 * 1000 - now) / 1000
    );
    return {
      allowed: false,
      reason:
        "Verity has hit its limit for today. Every run calls a real model on a real budget, so the ceiling is deliberate rather than a fault — try again tomorrow, or clone the repository and run it with your own key.",
      retryAfterSeconds,
      remaining: 0,
    };
  }

  evictExpired(state, config, now);

  const record = state.visitors.get(visitorKey);
  if (!record || now - record.windowStartedAt > config.perVisitorWindowMs) {
    state.visitors.set(visitorKey, { count: 1, windowStartedAt: now });
    state.globalCount += 1;
    return { allowed: true, remaining: config.perVisitorLimit - 1 };
  }

  if (record.count >= config.perVisitorLimit) {
    const retryAfterSeconds = Math.ceil(
      (record.windowStartedAt + config.perVisitorWindowMs - now) / 1000
    );
    return {
      allowed: false,
      reason: `You have had your ${config.perVisitorLimit} runs for this hour. The limit exists because each one costs real money against a real model; it resets within the hour, and the repository runs the whole thing locally with your own key.`,
      retryAfterSeconds,
      remaining: 0,
    };
  }

  record.count += 1;
  state.globalCount += 1;
  return { allowed: true, remaining: config.perVisitorLimit - record.count };
}

/**
 * Identifies a caller for rate limiting.
 *
 * Behind Vercel the client address arrives in x-forwarded-for, whose first
 * entry is the original client; later entries are proxies and are trivially
 * spoofable, so only the first is used.
 */
export function visitorKeyFrom(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]!.trim();
  }
  return headers.get("x-real-ip") ?? "unknown";
}

/** Test seam. Not reachable from any route. */
export function __resetRateLimitsForTests(): void {
  buckets.clear();
}
