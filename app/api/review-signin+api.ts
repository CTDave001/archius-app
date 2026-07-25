// App Review demo-account sign-in bridge.
//
// Clerk's Client Trust feature emails a verification code whenever a
// password sign-in comes from an unrecognized device. Apple's reviewer can't
// read the demo account's inbox, so the demo credentials would dead-end at
// the code screen — an automatic 2.1 rejection ("we could not access the
// app with the credentials provided").
//
// This endpoint lets the app complete sign-in for ONE designated demo
// account without the email code: it verifies the submitted password
// server-side, then mints a Clerk sign-in token (ticket) which the client
// exchanges for a session directly. Ticket sign-ins don't trigger Client
// Trust. Scope is intentionally narrow: exactly one account, password still
// required, nothing about other users is reachable through it.

import { createClerkClient } from '@clerk/backend';
import { env } from '@/utils/env';

const DEMO_EMAIL = (env('REVIEW_DEMO_EMAIL') ?? '').toLowerCase();

export async function POST(req: Request) {
  const secretKey = env('CLERK_SECRET_KEY');
  const demoPassword = env('REVIEW_DEMO_PASSWORD');

  if (!secretKey || !DEMO_EMAIL || !demoPassword) {
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { email?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const email = (body.email ?? '').toLowerCase().trim();
  const password = body.password ?? '';

  if (email !== DEMO_EMAIL || password !== demoPassword) {
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
      return new Response(JSON.stringify({ error: 'Demo account missing' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }
    const token = await clerk.signInTokens.createSignInToken({
      userId: user.id,
      expiresInSeconds: 300,
    });
    return new Response(JSON.stringify({ ticket: token.token }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    console.warn('[review-signin] failed:', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'Sign-in token failed' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}
