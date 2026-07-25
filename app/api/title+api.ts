import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

import { MODELS } from '@/utils/ai';
import { env } from '@/utils/env';
import { recordTitleAndCheck } from '@/utils/rateLimit';
import { authenticate } from '@/utils/serverAuth';

const deepseek = createOpenAI({
  apiKey: env('DEEPSEEK_API_KEY'),
  baseURL: 'https://api.deepseek.com/v1',
});

const TITLE_SYSTEM = `You write very short titles for chat conversations.

Rules:
- 3 to 5 words.
- Title Case (capitalize each major word).
- No quotes. No trailing punctuation.
- No <thinking> tags, reasoning, or commentary — output ONLY the title.

The user message you receive is the first message of a new chat. Title it
based on what the user wants help with.`;
const MAX_TITLE_REQUEST_BYTES = 8 * 1024;

const cleanTitle = (raw: string): string => {
  return raw
    .trim()
    // Strip any <thinking>...</thinking> blocks the reasoning model emits.
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/[.!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
};

export async function POST(req: Request) {
  if (!env('DEEPSEEK_API_KEY')) {
    return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const user = await authenticate(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TITLE_REQUEST_BYTES) {
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
  if (new TextEncoder().encode(rawBody).byteLength > MAX_TITLE_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body is too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }

  let body: { message?: unknown };
  try {
    const parsed = JSON.parse(rawBody);
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return new Response(JSON.stringify({ error: 'Empty message' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Light cap on title gen to prevent spam-creating chats. Invalid requests
  // above do not consume a user's allowance.
  const rate = recordTitleAndCheck(user.userId);
  if (!rate.ok) {
    return new Response(
      JSON.stringify({ error: 'rate_limited', retryAfterSeconds: rate.retryAfterSeconds }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(rate.retryAfterSeconds),
        },
      }
    );
  }

  try {
    const { text } = await generateText({
      model: deepseek.chat(MODELS.flash),
      system: TITLE_SYSTEM,
      prompt: message.slice(0, 600),
    });
    const title = cleanTitle(text);
    if (!title) {
      return new Response(JSON.stringify({ error: 'Empty title' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ title }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch (e: any) {
    console.warn('[api/title] generation failed:', e?.message ?? e);
    return new Response(
      JSON.stringify({ error: 'Title generation failed' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
