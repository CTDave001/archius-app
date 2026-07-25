// App Review demo-account sign-in bridge.
//
// Clerk's Client Trust feature emails a verification code whenever a
// password sign-in comes from an unrecognized device. Apple's reviewer can't
// read the demo account's inbox, so the demo credentials would dead-end at
// the code screen — an automatic 2.1 rejection ("we could not access the
// app with the credentials provided").
//
// This endpoint lets the app complete sign-in for ONE designated demo
// account without the email code: Clerk verifies the submitted password
// against the actual account, then this endpoint mints a sign-in token which
// the client
// exchanges for a session directly. Ticket sign-ins don't trigger Client
// Trust. Scope is intentionally narrow: exactly one account, password still
// required, nothing about other users is reachable through it.

import { createClerkClient } from '@clerk/backend';
import { env } from '@/utils/env';
import { recordReviewSignInAttempt } from '@/utils/rateLimit';

const DEMO_EMAIL = (env('REVIEW_DEMO_EMAIL') ?? '').toLowerCase();
const MAX_REVIEW_REQUEST_BYTES = 16 * 1024;

export async function POST(req: Request) {
  const secretKey = env('CLERK_SECRET_KEY');

  if (!secretKey || !DEMO_EMAIL) {
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REVIEW_REQUEST_BYTES) {
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
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REVIEW_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body is too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { email?: unknown; password?: unknown };
  try {
    const parsed = JSON.parse(rawBody);
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const forwardedFor = req.headers.get('x-forwarded-for');
  const clientIp =
    forwardedFor?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    'unknown-client';
  const attempt = recordReviewSignInAttempt(clientIp);
  if (!attempt.ok) {
    return new Response(JSON.stringify({ error: 'Too many attempts. Try again later.' }), {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'retry-after': String(attempt.retryAfterSeconds),
      },
    });
  }

  if (email !== DEMO_EMAIL || !password) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  try {
    const clerk = createClerkClient({ secretKey });
    const users = await clerk.users.getUserList({ emailAddress: [DEMO_EMAIL] });
    const user = users.data?.[0];
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    await clerk.users.verifyPassword({ userId: user.id, password });
    const token = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 300,
    });
    return new Response(JSON.stringify({ ticket: token.token }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    // Invalid passwords and account lookup details intentionally share one
    // response, so this endpoint does not become an account oracle.
    console.warn('[review-signin] rejected or failed:', e?.status ?? e?.name ?? 'unknown');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }
}
