// RevenueCat → Clerk entitlement bridge.
//
// RevenueCat is the source of truth for whether a user has paid for Pro.
// When entitlement state changes (purchase, renewal, expiration), RC POSTs
// an event to this endpoint, and we write the result into Clerk
// publicMetadata.isPro so the chat API can read it.
//
// SETUP (one-time, in the RevenueCat dashboard):
//   1. Project Settings → Integrations → Webhooks → Add webhook
//   2. URL: https://<your-prod-host>/api/revenuecat-webhook
//   3. Authorization header value: any random string — set it here as
//      REVENUECAT_WEBHOOK_AUTH on the server too.
//   4. Make sure the client calls Purchases.logIn(clerkUserId) right after
//      sign-in so app_user_id on the event matches the Clerk userId.

import { createClerkClient } from '@clerk/backend';
import { env } from '@/utils/env';
import { invalidateProCache } from '@/utils/serverAuth';

const PRO_ENTITLEMENT_ID = 'pro';

// Events that grant Pro
const ACTIVATING_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'TRANSFER',
  'NON_RENEWING_PURCHASE',
]);

// Events that revoke Pro
const REVOKING_EVENTS = new Set([
  'EXPIRATION',
  'CANCELLATION', // user cancelled but may still have time left — RC sends EXPIRATION at the actual end
  'BILLING_ISSUE',
  'SUBSCRIPTION_PAUSED',
]);

export async function POST(req: Request) {
  const secretKey = env('CLERK_SECRET_KEY');
  const webhookAuth = env('REVENUECAT_WEBHOOK_AUTH');

  if (!secretKey || !webhookAuth) {
    console.warn('[rc-webhook] missing CLERK_SECRET_KEY or REVENUECAT_WEBHOOK_AUTH');
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Auth: RC sends the exact value we set in the dashboard as the
  // Authorization header. Both sides are trimmed — a stray newline on either
  // end used to fail this comparison and 401 every event (see utils/env.ts).
  const incoming = (req.headers.get('authorization') ?? '').trim();
  if (incoming !== webhookAuth) {
    console.warn('[rc-webhook] rejected: Authorization header did not match');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const event = body?.event ?? body;
  const type: string | undefined = event?.type;
  const userId: string | undefined = event?.app_user_id;
  const entitlementIds: string[] = event?.entitlement_ids ?? [];

  if (!type || !userId) {
    return new Response(JSON.stringify({ error: 'Malformed event' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Only act on events touching our Pro entitlement (RC may send events
  // for other products if you ever add them).
  const touchesPro =
    entitlementIds.length === 0 || entitlementIds.includes(PRO_ENTITLEMENT_ID);
  if (!touchesPro) {
    return new Response(JSON.stringify({ ok: true, skipped: 'entitlement_mismatch' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  let nextIsPro: boolean | null = null;
  if (ACTIVATING_EVENTS.has(type)) nextIsPro = true;
  else if (REVOKING_EVENTS.has(type)) nextIsPro = false;
  // Other event types (TEST, etc.) — ack and skip
  if (nextIsPro === null) {
    return new Response(JSON.stringify({ ok: true, skipped: 'noop_event_type' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Anonymous RC IDs start with "$RCAnonymousID:" — those can't be linked to
  // a Clerk user. Skip and let the next event (post-login) catch it.
  if (userId.startsWith('$RCAnonymousID:')) {
    return new Response(JSON.stringify({ ok: true, skipped: 'anonymous_user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const clerk = createClerkClient({ secretKey });
    await clerk.users.updateUserMetadata(userId, {
      publicMetadata: { isPro: nextIsPro },
    });
    invalidateProCache(userId);
  } catch (e: any) {
    console.warn('[rc-webhook] failed to update Clerk metadata:', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'Failed to sync entitlement' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, isPro: nextIsPro }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
