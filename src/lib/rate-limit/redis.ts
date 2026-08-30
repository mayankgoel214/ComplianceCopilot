import { Redis } from "@upstash/redis";

import { type BucketConfig, checkRateLimit as checkInMemory, type RateLimitResult } from "../demo/rate-limit";

/**
 * Rate limiting that actually holds.
 *
 * The in-memory limiter this replaces was decorative in production. Its state
 * lived in a module-level Map, so it reset on every cold start and was
 * per-instance besides: a visitor who kept requesting simply got a fresh
 * allowance from whichever lambda answered. It bounded nothing.
 *
 * A fixed window in Redis, one INCR per request with an EXPIRE on first write.
 * Fixed rather than sliding because the failure mode of a fixed window — up to
 * double the limit across a boundary — costs a few cents here, and a sliding
 * window costs a sorted set per visitor and a script to trim it. Not worth it
 * for this.
 *
 * When Redis is unreachable the in-memory limiter takes over. That is a
 * deliberate fail-open: refusing every visitor because a cache is down is worse
 * than a weakened ceiling, and the weakened ceiling is exactly what the system
 * had before.
 */

let redis: Redis | null = null;
let unavailableUntil = 0;

/**
 * Which environment's allowance a request spends.
 *
 * One Upstash database serves local development, CI and production, and without
 * this they all incremented the same counters — so a test run drained the
 * budget the public deployment was meant to have, and a preview deployment
 * could exhaust production's daily ceiling before anyone visited it. The
 * namespace is derived rather than configured, so a new preview gets its own
 * allowance without anyone remembering to set anything.
 */
const NAMESPACE =
  process.env.VERITY_RATE_LIMIT_NAMESPACE ??
  (process.env.VERCEL_ENV === "production"
    ? "prod"
    : process.env.VERCEL_ENV
      ? `preview-${process.env.VERCEL_GIT_COMMIT_REF ?? "unknown"}`
      : `local-${process.env.NODE_ENV ?? "dev"}`);

/**
 * Production's ceilings are a cost control. Everywhere else they exist only to
 * catch a runaway loop, and holding a test suite to three runs an hour means
 * the suite fails for reasons that have nothing to do with the code.
 */
const IS_PRODUCTION = process.env.VERCEL_ENV === "production";

function limitsFor(config: BucketConfig): BucketConfig {
  if (IS_PRODUCTION) return config;
  return {
    ...config,
    perVisitorLimit: Math.max(config.perVisitorLimit, 50),
    globalDailyLimit: Math.max(config.globalDailyLimit, 500),
  };
}

export const isRedisConfigured = Boolean(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

function client(): Redis | null {
  if (!isRedisConfigured) return null;
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return redis;
}

/** The window a timestamp falls in, so every instance agrees on the key. */
function windowKey(config: BucketConfig, visitorKey: string, now: number): string {
  const window = Math.floor(now / config.perVisitorWindowMs);
  return `verity:rl:${NAMESPACE}:${config.name}:${window}:${visitorKey}`;
}

function globalKey(config: BucketConfig, now: number): string {
  const day = Math.floor(now / (24 * 60 * 60 * 1000));
  return `verity:rl:${NAMESPACE}:${config.name}:global:${day}`;
}

export interface DistributedRateLimitResult extends RateLimitResult {
  /** False when this fell back to the per-instance limiter. */
  distributed: boolean;
}

export async function checkRateLimit(
  visitorKey: string,
  bucket: BucketConfig
): Promise<DistributedRateLimitResult> {
  const config = limitsFor(bucket);
  const now = Date.now();
  const r = client();

  // After a failure, stop trying for a minute. Retrying a dead cache on every
  // request turns one outage into latency on every response.
  if (!r || now < unavailableUntil) {
    return { ...checkInMemory(visitorKey, config), distributed: false };
  }

  try {
    const perVisitor = windowKey(config, visitorKey, now);
    const global = globalKey(config, now);

    const [visitorCount, globalCount] = (await r
      .pipeline()
      .incr(perVisitor)
      .incr(global)
      .exec()) as [number, number];

    // Expiry is set on the first write of each window. Setting it every time
    // would slide the window forward and let a steady stream of requests keep a
    // key alive indefinitely.
    if (visitorCount === 1) {
      await r.expire(perVisitor, Math.ceil(config.perVisitorWindowMs / 1000));
    }
    if (globalCount === 1) {
      await r.expire(global, 24 * 60 * 60);
    }

    if (globalCount > config.globalDailyLimit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil((24 * 60 * 60 * 1000 - (now % (24 * 60 * 60 * 1000))) / 1000),
        reason:
          "Verity has hit its limit for today. Every run calls a real model on a real budget, so the ceiling is deliberate rather than a fault — try again tomorrow, or clone the repository and run it with your own key.",
        distributed: true,
      };
    }

    if (visitorCount > config.perVisitorLimit) {
      const elapsed = now % config.perVisitorWindowMs;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil((config.perVisitorWindowMs - elapsed) / 1000),
        reason: `You have had your ${config.perVisitorLimit} runs for this hour. The limit exists because each one costs real money against a real model; it resets within the hour, and the repository runs the whole thing locally with your own key.`,
        distributed: true,
      };
    }

    return {
      allowed: true,
      remaining: Math.max(0, config.perVisitorLimit - visitorCount),
      distributed: true,
    };
  } catch (error) {
    console.error("Redis rate limit unavailable, falling back to per-instance:", error);
    unavailableUntil = now + 60_000;
    return { ...checkInMemory(visitorKey, config), distributed: false };
  }
}

/** Test seam. */
export function __resetRedisRateLimitState(): void {
  redis = null;
  unavailableUntil = 0;
}
