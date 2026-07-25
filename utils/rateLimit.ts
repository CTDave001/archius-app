/**
 * Per-user message rate limiter for the chat API.
 *
 * For v1 this uses a single in-memory store. That's fine for the Metro dev
 * server (single process) and for TestFlight beta with a handful of users.
 * Before public launch, replace with a real KV store (Upstash Redis,
 * Cloudflare KV, or similar) — otherwise:
 *   - State resets every time Metro restarts (no harm, just no accumulation)
 *   - State is per-instance when deployed to multi-replica hosting (limits
 *     get bypassed). Mitigation: deploy as single-instance for beta.
 *
 * The interface (recordAndCheck) deliberately mirrors what a Redis-backed
 * version would look like, so the swap is mechanical.
 */

import {
  FREE_DAILY_MESSAGE_LIMIT,
  PRO_DAILY_FLASH_LIMIT,
  PRO_DAILY_IMAGE_LIMIT,
  PRO_DAILY_REASONER_LIMIT,
  PRO_DAILY_SEARCH_LIMIT,
  type ModelTier,
} from '@/utils/ai';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const REVIEW_SIGN_IN_WINDOW_MS = 15 * 60 * 1000;
const REVIEW_SIGN_IN_LIMIT = 5;

type Bucket = 'flash' | 'reasoner' | 'title' | 'search' | 'image';
type UsageMap = Map<string, number[]>;

// userId -> bucket -> timestamps within rolling 24h
const usage: Record<Bucket, UsageMap> = {
  flash: new Map(),
  reasoner: new Map(),
  title: new Map(),
  search: new Map(),
  image: new Map(),
};
const reviewSignInAttempts = new Map<string, number[]>();

// Title generation has its own light cap to prevent abuse (a user creating
// hundreds of empty chats just to spam the title endpoint). Title gen is
// auth-only so this is defense-in-depth, not the primary control.
const TITLE_DAILY_LIMIT = 200;

const prune = (timestamps: number[], now: number): number[] => {
  const cutoff = now - ONE_DAY_MS;
  return timestamps.filter((t) => t > cutoff);
};

const bucketFor = (tier: ModelTier): Bucket =>
  tier === 'pro' ? 'reasoner' : 'flash';

const limitFor = (bucket: Bucket, isPro: boolean): number => {
  if (bucket === 'title') return TITLE_DAILY_LIMIT;
  if (bucket === 'search') return isPro ? PRO_DAILY_SEARCH_LIMIT : 0;
  if (bucket === 'image') return isPro ? PRO_DAILY_IMAGE_LIMIT : 0;
  if (bucket === 'reasoner') return isPro ? PRO_DAILY_REASONER_LIMIT : 0;
  return isPro ? PRO_DAILY_FLASH_LIMIT : FREE_DAILY_MESSAGE_LIMIT;
};

export type RateLimitResult =
  | { ok: true; used: number; limit: number; bucket: Bucket }
  | { ok: false; used: number; limit: number; bucket: Bucket; retryAfterSeconds: number };

export type AttemptLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number };

/**
 * Brute-force protection for the one-account App Review bridge. This remains
 * a best-effort, per-instance guard until the app uses a shared server-side
 * rate-limit store.
 */
export function recordReviewSignInAttempt(clientKey: string): AttemptLimitResult {
  const now = Date.now();
  const cutoff = now - REVIEW_SIGN_IN_WINDOW_MS;
  const recent = (reviewSignInAttempts.get(clientKey) ?? []).filter((time) => time > cutoff);

  if (recent.length >= REVIEW_SIGN_IN_LIMIT) {
    reviewSignInAttempts.set(clientKey, recent);
    return {
      ok: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((recent[0] + REVIEW_SIGN_IN_WINDOW_MS - now) / 1000)
      ),
    };
  }

  recent.push(now);
  reviewSignInAttempts.set(clientKey, recent);
  return { ok: true };
}

/**
 * Records a new usage timestamp if under the limit, otherwise refuses and
 * returns ok:false with a retry-after hint (seconds until the oldest counted
 * timestamp falls out of the 24h window).
 */
export function recordAndCheck(
  userId: string,
  tier: ModelTier,
  isPro: boolean
): RateLimitResult {
  const bucket = bucketFor(tier);
  return recordInBucket(userId, bucket, limitFor(bucket, isPro));
}

/**
 * Lightweight rate limit for the title-generation endpoint. Title gen costs
 * money too — keep it bounded.
 */
export function recordTitleAndCheck(userId: string): RateLimitResult {
  return recordInBucket(userId, 'title', TITLE_DAILY_LIMIT);
}

/**
 * Rate limit for web search (Pro-only). Each search is a paid Tavily call,
 * so this bounds cost. isPro=false yields a 0 limit (no search).
 */
export function recordSearchAndCheck(userId: string, isPro: boolean): RateLimitResult {
  return recordInBucket(userId, 'search', limitFor('search', isPro));
}

/**
 * Rate limit for image-input turns (Pro-only). Each image turn hits Gemini.
 * isPro=false yields a 0 limit (no image input).
 */
export function recordImageAndCheck(userId: string, isPro: boolean): RateLimitResult {
  return recordInBucket(userId, 'image', limitFor('image', isPro));
}

function recordInBucket(
  userId: string,
  bucket: Bucket,
  limit: number
): RateLimitResult {
  const now = Date.now();
  const map = usage[bucket];
  const recent = prune(map.get(userId) ?? [], now);

  if (limit === 0) {
    return {
      ok: false,
      used: recent.length,
      limit,
      bucket,
      retryAfterSeconds: ONE_DAY_MS / 1000,
    };
  }

  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + ONE_DAY_MS - now) / 1000));
    map.set(userId, recent);
    return {
      ok: false,
      used: recent.length,
      limit,
      bucket,
      retryAfterSeconds,
    };
  }

  recent.push(now);
  map.set(userId, recent);
  return { ok: true, used: recent.length, limit, bucket };
}

export function getUsage(
  userId: string,
  tier: ModelTier,
  isPro: boolean
): { used: number; limit: number } {
  const bucket = bucketFor(tier);
  const recent = prune(usage[bucket].get(userId) ?? [], Date.now());
  return { used: recent.length, limit: limitFor(bucket, isPro) };
}
