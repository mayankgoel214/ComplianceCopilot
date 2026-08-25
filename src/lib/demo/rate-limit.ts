/**
 * Spend limits for the public demo.
 *
 * Every demo run makes several Gemini calls against a real billing account, so
 * this is a cost control before it is anything else. Two ceilings, because they
 * fail differently: the per-visitor one stops somebody holding down a button,
 * and the global one bounds the bill if a link gets shared widely.
 *
 * State is in memory, which means it resets on cold start and is per-instance.
 * That is a real weakness and the right fix is a shared store — but for a demo
 * whose whole input is one fixed document, an imperfect ceiling is much better
 * than none, and the alternative is a Redis dependency for a page nobody is
 * signed in to.
 */

const PER_VISITOR_LIMIT = 3;
const PER_VISITOR_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const GLOBAL_DAILY_LIMIT = 100;

interface VisitorRecord {
  count: number;
  windowStartedAt: number;
}

const visitors = new Map<string, VisitorRecord>();
let globalCount = 0;
let globalWindowStartedAt = Date.now();

export interface RateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterSeconds?: number;
  remaining: number;
}

/** Keeps the visitor map from growing without bound on a long-lived instance. */
function evictExpired(now: number): void {
  for (const [key, record] of visitors) {
    if (now - record.windowStartedAt > PER_VISITOR_WINDOW_MS) {
      visitors.delete(key);
    }
  }
}

export function checkRateLimit(visitorKey: string): RateLimitResult {
  const now = Date.now();

  if (now - globalWindowStartedAt > 24 * 60 * 60 * 1000) {
    globalCount = 0;
    globalWindowStartedAt = now;
  }

  if (globalCount >= GLOBAL_DAILY_LIMIT) {
    const retryAfterSeconds = Math.ceil(
      (globalWindowStartedAt + 24 * 60 * 60 * 1000 - now) / 1000
    );
    return {
      allowed: false,
      reason:
        "The demo has hit its daily limit. It runs a real model against a real budget, so the ceiling is deliberate — try again tomorrow, or run it locally from the repository.",
      retryAfterSeconds,
      remaining: 0,
    };
  }

  evictExpired(now);

  const record = visitors.get(visitorKey);
  if (!record || now - record.windowStartedAt > PER_VISITOR_WINDOW_MS) {
    visitors.set(visitorKey, { count: 1, windowStartedAt: now });
    globalCount += 1;
    return { allowed: true, remaining: PER_VISITOR_LIMIT - 1 };
  }

  if (record.count >= PER_VISITOR_LIMIT) {
    const retryAfterSeconds = Math.ceil(
      (record.windowStartedAt + PER_VISITOR_WINDOW_MS - now) / 1000
    );
    return {
      allowed: false,
      reason: `You have run the demo ${PER_VISITOR_LIMIT} times this hour, which is the per-visitor limit.`,
      retryAfterSeconds,
      remaining: 0,
    };
  }

  record.count += 1;
  globalCount += 1;
  return { allowed: true, remaining: PER_VISITOR_LIMIT - record.count };
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
