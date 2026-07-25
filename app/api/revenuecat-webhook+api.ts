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
import { getRevenueCatProStatus, invalidateProCache } from '@/utils/serverAuth';

const PRO_ENTITLEMENT_ID = 'pro';
const MAX_WEBHOOK_REQUEST_BYTES = 256 * 1024;

export async function POST(req: Request) {
  const secretKey = env('CLERK_SECRET_KEY');
  const webhookAuth = env('REVENUECAT_WEBHOOK_AUTH');
  const revenueCatSecret = env('REVENUECAT_SECRET_KEY');

  if (!secretKey || !webhookAuth || !revenueCatSecret) {
    console.warn('[rc-webhook] missing required server configuration');
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

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body is too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_WEBHOOK_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body is too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const event = body?.event ?? body;
  const type: string | undefined = event?.type;
  const entitlementIds: string[] = Array.isArray(event?.entitlement_ids)
    ? event.entitlement_ids
    : [];

  if (!type) {
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

  // TEST is only a connectivity probe and has no subscriber state to sync.
  // Every real event is reconciled against RevenueCat below instead of
  // guessing from the event name. For example, CANCELLATION normally means
  // "will not renew", not "access ended now".
  if (type === 'TEST') {
    return new Response(JSON.stringify({ ok: true, skipped: 'noop_event_type' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  // TRANSFER events can omit app_user_id and instead identify both sides in
  // transferred_from/transferred_to. Reconcile every linked Clerk identity:
  // the source may need revocation while the destination gains access.
  const candidateIds = [
    event?.app_user_id,
    ...(Array.isArray(event?.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event?.transferred_to) ? event.transferred_to : []),
  ];
  const userIds = Array.from(
    new Set(
      candidateIds.filter(
        (candidate): candidate is string =>
          typeof candidate === 'string' && candidate.startsWith('user_')
      )
    )
  );

  if (userIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'unlinked_user' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const entitlementResults = await Promise.all(
    userIds.map(async (userId) => ({
      userId,
      isPro: await getRevenueCatProStatus(userId),
    }))
  );
  if (entitlementResults.some((result) => result.isPro === null)) {
    // A non-2xx asks RevenueCat to retry. Acknowledging while its subscriber
    // API is unavailable would silently lose the reconciliation opportunity.
    return new Response(JSON.stringify({ error: 'Entitlement lookup unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json', 'retry-after': '30' },
    });
  }

  try {
    const clerk = createClerkClient({ secretKey });
    await Promise.all(
      entitlementResults.map(async ({ userId, isPro }) => {
        await clerk.users.updateUserMetadata(userId, {
          publicMetadata: { isPro: isPro as boolean },
        });
        invalidateProCache(userId);
      })
    );
  } catch (e: any) {
    console.warn('[rc-webhook] failed to update Clerk metadata:', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'Failed to sync entitlement' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true, syncedUsers: userIds.length }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
