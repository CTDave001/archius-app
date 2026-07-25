// Shared server-side auth helper. Reads the Clerk JWT, verifies it, and
// resolves the user's Pro entitlement.
//
// Pro entitlement resolution, in order:
//   1. Clerk publicMetadata.isPro — written by the RevenueCat webhook. Fast
//      (often already in the JWT), but only as reliable as the webhook.
//   2. RevenueCat's REST API — authoritative. Consulted whenever (1) does not
//      already say "Pro", and the result is written back to Clerk so the fast
//      path takes over on subsequent requests.
//
// Why (2) exists: the webhook was silently 401ing every event (a trailing
// newline in REVENUECAT_WEBHOOK_AUTH — see utils/env.ts), so publicMetadata
// was never set and *every paying user was served free tier*: no web search,
// no image input, no advanced model. Nothing detected it and nothing could
// recover from it, because the webhook was the only path to the truth and a
// missed event was gone forever.
//
// Asking RevenueCat directly makes the webhook a latency optimization rather
// than a correctness dependency: a dropped event now costs one slow request,
// not a permanently downgraded customer. The client is never trusted — the
// entitlement always comes from RevenueCat or Clerk, never from the app.

import { createClerkClient, verifyToken } from '@clerk/backend';
import { env } from '@/utils/env';

const PRO_ENTITLEMENT_ID = 'pro';

// Positive results are cheap to re-verify and we want revocation to land
// promptly; negative results are the common case (free users) and re-checking
// them on every request would hammer RevenueCat for no benefit.
const PRO_TTL_MS = 60_000;
const FREE_TTL_MS = 5 * 60_000;

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
async function revenueCatHasPro(userId: string): Promise<boolean | null> {
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
 * Resolve Pro state for a user, preferring Clerk's cached metadata and
 * falling back to RevenueCat. Writes a positive RevenueCat result back to
 * Clerk so the next request can take the fast path.
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

  if (clerkIsPro) return true;

  const rcIsPro = await revenueCatHasPro(userId);
  if (rcIsPro === null) return clerkIsPro; // unknown — fall back to what Clerk said
  if (!rcIsPro) return false;

  // RevenueCat says Pro but Clerk didn't know: the webhook was missed. Heal it
  // so we stop paying for this lookup on every request.
  try {
    await client.users.updateUserMetadata(userId, { publicMetadata: { isPro: true } });
    console.info('[auth] healed missing Pro entitlement from RevenueCat for', userId);
  } catch (e: any) {
    console.warn('[auth] could not write healed entitlement to Clerk:', e?.message ?? e);
  }
  return true;
}

/**
 * Verifies the Authorization header and resolves the user's Pro entitlement.
 * Returns null if the request is unauthenticated.
 */
export async function authenticate(req: Request): Promise<AuthedUser | null> {
  const secretKey = env('CLERK_SECRET_KEY');
  if (!secretKey) {
    // Dev convenience: no CLERK_SECRET_KEY set means we accept anything as
    // dev-anonymous. Never reachable in prod (key is always set there).
    console.warn('[auth] CLERK_SECRET_KEY not set — allowing anonymous request');
    return { userId: 'dev-anonymous', isPro: false };
  }

  const authHeader = req.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) return null;

  let userId: string;
  try {
    const payload = await verifyToken(token, { secretKey });
    if (!payload.sub) return null;
    userId = payload.sub;

    // If the JWT template carries publicMetadata.isPro we can trust a *true*
    // here and skip the lookups entirely. A false is NOT trusted: the claim is
    // baked in when the token is minted, so a user who upgraded mid-session
    // would be stuck on free until their token rotated.
    const meta = (payload as any).public_metadata ?? (payload as any).pub;
    if (meta && typeof meta === 'object' && meta.isPro === true) {
      return { userId, isPro: true };
    }
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
