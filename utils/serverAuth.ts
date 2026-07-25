// Shared server-side auth helper. Reads the Clerk JWT, verifies it, and
// resolves the user's Pro entitlement.
//
// Pro entitlement resolution:
//   1. RevenueCat's REST API is the source of truth on every cache miss.
//   2. Clerk publicMetadata.isPro is a webhook-maintained availability
//      fallback when RevenueCat cannot be reached.
//
// Why (2) exists: the webhook was silently 401ing every event (a trailing
// newline in REVENUECAT_WEBHOOK_AUTH — see utils/env.ts), so publicMetadata
// was never set and *every paying user was served free tier*: no web search,
// no image input, no advanced model. Nothing detected it and nothing could
// recover from it, because the webhook was the only path to the truth and a
// missed event was gone forever.
//
// Asking RevenueCat directly makes the webhook an availability optimization
// rather than a permanent source of truth. The client and its potentially
// stale JWT metadata are never trusted for the entitlement decision.

import { createClerkClient, verifyToken } from '@clerk/backend';
import { env } from '@/utils/env';

const PRO_ENTITLEMENT_ID = 'pro';

// Keep both directions short: revocations should land promptly, and a user
// who just purchased must not remain stuck in a cached free state for several
// minutes if their webhook is handled by another serverless instance.
const PRO_TTL_MS = 60_000;
const FREE_TTL_MS = 60_000;

type CacheEntry = { isPro: boolean; expiresAt: number };
const proCache = new Map<string, CacheEntry>();

let clerkClient: ReturnType<typeof createClerkClient> | null = null;
const getClerkClient = (secretKey: string) => {
  if (!clerkClient) clerkClient = createClerkClient({ secretKey });
  return clerkClient;
};

export type AuthedUser = {
  userId: string;
  isPro: boolean;
};

/**
 * Ask RevenueCat whether this user currently holds the Pro entitlement.
 * Returns null if RevenueCat isn't configured or the call fails — callers
 * must treat null as "unknown", not as "not Pro".
 */
export async function getRevenueCatProStatus(userId: string): Promise<boolean | null> {
  const rcKey = env('REVENUECAT_SECRET_KEY');
  if (!rcKey) return null;

  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        headers: { Authorization: `Bearer ${rcKey}`, accept: 'application/json' },
        signal: AbortSignal.timeout(4_000),
      }
    );
    if (!res.ok) {
      console.warn('[auth] RevenueCat lookup failed:', res.status);
      return null;
    }

    const data: any = await res.json();
    const ent = data?.subscriber?.entitlements?.[PRO_ENTITLEMENT_ID];
    if (!ent) return false;

    // A null expires_date means a non-expiring entitlement (lifetime).
    if (!ent.expires_date) return true;
    return new Date(ent.expires_date).getTime() > Date.now();
  } catch (e: any) {
    console.warn('[auth] RevenueCat lookup errored:', e?.message ?? e);
    return null;
  }
}

/**
 * Resolve Pro state for a user. RevenueCat is authoritative; Clerk metadata
 * is kept in sync in both directions and is used only if RevenueCat is
 * temporarily unavailable.
 */
async function resolveIsPro(userId: string, secretKey: string): Promise<boolean> {
  const client = getClerkClient(secretKey);

  let clerkIsPro = false;
  try {
    const user = await client.users.getUser(userId);
    clerkIsPro = (user.publicMetadata as any)?.isPro === true;
  } catch (e: any) {
    // Don't give up here — RevenueCat below is the authoritative source and
    // may still be reachable.
    console.warn('[auth] Clerk getUser failed:', e?.message ?? e);
  }

  const rcIsPro = await getRevenueCatProStatus(userId);
  if (rcIsPro === null) return clerkIsPro; // unknown — fall back to what Clerk said

  if (rcIsPro !== clerkIsPro) {
    // Heal missed or out-of-order webhooks in either direction. In particular,
    // this prevents an old Clerk "true" from granting Pro forever after a
    // cancellation/expiration event was missed.
    try {
      await client.users.updateUserMetadata(userId, {
        publicMetadata: { isPro: rcIsPro },
      });
      console.info('[auth] reconciled Pro entitlement from RevenueCat for', userId);
    } catch (e: any) {
      console.warn('[auth] could not reconcile entitlement to Clerk:', e?.message ?? e);
    }
  }
  return rcIsPro;
}

/**
 * Verifies the Authorization header and resolves the user's Pro entitlement.
 * Returns null if the request is unauthenticated.
 */
export async function authenticate(req: Request): Promise<AuthedUser | null> {
  const secretKey = env('CLERK_SECRET_KEY');
  if (!secretKey) {
    // Authentication must fail closed in every environment. A missing
    // production variable must never turn a paid API endpoint public.
    console.error('[auth] CLERK_SECRET_KEY is not configured');
    return null;
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  let userId: string;
  try {
    const payload = await verifyToken(token, { secretKey });
    if (!payload.sub) return null;
    userId = payload.sub;

  } catch (e: any) {
    console.warn('[auth] verifyToken failed:', e?.reason || e?.message || e);
    return null;
  }

  const now = Date.now();
  const cached = proCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { userId, isPro: cached.isPro };
  }

  const isPro = await resolveIsPro(userId, secretKey);
  proCache.set(userId, {
    isPro,
    expiresAt: now + (isPro ? PRO_TTL_MS : FREE_TTL_MS),
  });
  return { userId, isPro };
}

/**
 * Invalidate the in-process cache for one user. Call from the RevenueCat
 * webhook after we write publicMetadata.isPro, so the next API request
 * picks it up immediately instead of waiting for the TTL.
 */
export function invalidateProCache(userId: string) {
  proCache.delete(userId);
}
