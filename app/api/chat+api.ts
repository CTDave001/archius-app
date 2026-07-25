import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { streamText, convertToModelMessages, stepCountIs, tool, type UIMessage } from 'ai';
import { z } from 'zod';

import {
  ARCHIUS_SYSTEM_PROMPT,
  GEMINI_VISION_MODEL,
  MODELS,
  NO_WEB_SEARCH_SYSTEM_ADDENDUM,
  WEB_SEARCH_SYSTEM_ADDENDUM,
  type ModelTier,
} from '@/utils/ai';
import { env } from '@/utils/env';
import { recordAndCheck, recordImageAndCheck, recordSearchAndCheck } from '@/utils/rateLimit';
import { authenticate } from '@/utils/serverAuth';
import { searchWeb } from '@/utils/tavily';

const deepseek = createOpenAI({
  apiKey: env('DEEPSEEK_API_KEY'),
  baseURL: 'https://api.deepseek.com/v1',
});

const google = createGoogleGenerativeAI({
  apiKey: env('GEMINI_API_KEY'),
});

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_MESSAGES = 100;
const MAX_TEXT_CHARS = 120_000;
const MAX_TEXT_PART_CHARS = 30_000;
const MAX_CURRENT_IMAGES = 1;

const validateMessages = (
  value: unknown
): { ok: true; messages: UIMessage[] } | { ok: false; detail: string } => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return { ok: false, detail: `messages must contain 1-${MAX_MESSAGES} items` };
  }

  let textChars = 0;
  let lastUserIndex = -1;

  for (let i = 0; i < value.length; i += 1) {
    const message = value[i] as any;
    if (
      !message ||
      typeof message !== 'object' ||
      !['system', 'user', 'assistant'].includes(message.role) ||
      !Array.isArray(message.parts)
    ) {
      return { ok: false, detail: 'messages contain an invalid item' };
    }
    if (message.role === 'user') lastUserIndex = i;

    for (const part of message.parts) {
      if (!part || typeof part !== 'object' || typeof part.type !== 'string') {
        return { ok: false, detail: 'messages contain an invalid part' };
      }
      if (part.type === 'text') {
        if (typeof part.text !== 'string' || part.text.length > MAX_TEXT_PART_CHARS) {
          return { ok: false, detail: 'a message is too long' };
        }
        textChars += part.text.length;
        if (textChars > MAX_TEXT_CHARS) {
          return { ok: false, detail: 'conversation text is too long' };
        }
      }
    }
  }

  if (lastUserIndex < 0) {
    return { ok: false, detail: 'a user message is required' };
  }

  // Only the latest user turn is sent to a vision model. Historical file://
  // parts are stripped below, so validate the current image payload strictly.
  const currentParts = (value[lastUserIndex] as any).parts as any[];
  const currentImages = currentParts.filter((part) => part?.type === 'file');
  if (currentImages.length > MAX_CURRENT_IMAGES) {
    return { ok: false, detail: 'only one image may be attached' };
  }
  for (const image of currentImages) {
    if (
      typeof image.mediaType !== 'string' ||
      !image.mediaType.startsWith('image/') ||
      typeof image.url !== 'string' ||
      !image.url.startsWith('data:image/') ||
      !image.url.includes(';base64,')
    ) {
      return { ok: false, detail: 'the current image attachment is invalid' };
    }
  }

  return { ok: true, messages: value as UIMessage[] };
};

// True if the most recent user message carries an image attachment.
const lastUserMessageHasImage = (messages: UIMessage[]): boolean => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    return (m.parts ?? []).some(
      (p: any) => p?.type === 'file' && typeof p.mediaType === 'string' && p.mediaType.startsWith('image/')
    );
  }
  return false;
};

// Replace image content parts on a single message with a text placeholder.
// Used to drop historical images that the model can't actually fetch (they
// live as local file:// URIs on the device, not reachable from the server).
const stripImageInMessage = (m: UIMessage): UIMessage => {
  const parts = (m.parts ?? []) as any[];
  if (!parts.some((p) => p?.type === 'file' && p?.mediaType?.startsWith?.('image/'))) {
    return m;
  }
  return {
    ...m,
    parts: parts.map((p) =>
      p?.type === 'file' && p?.mediaType?.startsWith?.('image/')
        ? { type: 'text', text: '[image attached earlier — omitted for this turn]' }
        : p
    ),
  } as UIMessage;
};

const findLastUserIndex = (messages: UIMessage[]): number => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
};

export async function POST(req: Request) {
  if (!env('DEEPSEEK_API_KEY')) {
    return new Response(
      JSON.stringify({ error: 'Server is missing DEEPSEEK_API_KEY' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body is too large' }), {
      status: 413,
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

  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return new Response(JSON.stringify({ error: 'Request body is too large' }), {
      status: 413,
      headers: { 'content-type': 'application/json' },
    });
  }

  let parsedBody: any;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const validated = validateMessages(parsedBody?.messages);
  if (!validated.ok) {
    return new Response(JSON.stringify({ error: 'Invalid request', detail: validated.detail }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }
  const body: { messages: UIMessage[]; modelTier?: ModelTier; webSearch?: boolean } = {
    ...parsedBody,
    messages: validated.messages,
  };
  if (body.modelTier !== undefined && body.modelTier !== 'flash' && body.modelTier !== 'pro') {
    return new Response(JSON.stringify({ error: 'Invalid model tier' }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const tier: ModelTier = body.modelTier ?? 'flash';
  const modelId = MODELS[tier] ?? MODELS.flash;
  const hasImage = lastUserMessageHasImage(body.messages ?? []);
  // Image turns route to Gemini (DeepSeek is text-only). They take priority
  // over the deep-think toggle for model selection.
  const isReasoner = tier === 'pro' && !hasImage;

  // Web search is Pro-only, gated server-side regardless of the client claim.
  // The model only actually searches when it decides the query needs it.
  // Disabled in reasoner ("deep think") and image modes for reliability.
  const wantsSearch = body.webSearch === true && user.isPro && !isReasoner && !hasImage;

  // Image input is Pro-only — refuse early with a precise message.
  if (hasImage && !user.isPro) {
    return new Response(
      JSON.stringify({
        error: 'pro_only',
        detail: 'Image input is a Pro feature. Upgrade to send images.',
      }),
      { status: 402, headers: { 'content-type': 'application/json' } }
    );
  }

  // Reasoning model is Pro-only too.
  if (tier === 'pro' && !user.isPro && !hasImage) {
    return new Response(
      JSON.stringify({
        error: 'pro_only',
        detail: 'The advanced model is only available on Pro. Upgrade to access it.',
      }),
      { status: 402, headers: { 'content-type': 'application/json' } }
    );
  }

  // Rate limit: image turns count against the image bucket (Gemini cost);
  // everything else against the per-tier message bucket.
  const rate = hasImage
    ? recordImageAndCheck(user.userId, user.isPro)
    : recordAndCheck(user.userId, tier, user.isPro);
  if (!rate.ok) {
    const detail = hasImage
      ? `You've used your ${rate.limit} image messages for today. Try again tomorrow.`
      : rate.limit === 0
        ? 'The advanced model is only available on Pro. Upgrade to access it.'
        : `You've used your ${rate.limit} ${tier === 'pro' ? 'advanced ' : ''}messages for today. ${user.isPro ? 'Try again tomorrow.' : 'Upgrade to Pro for more.'}`;
    return new Response(
      JSON.stringify({
        error: 'rate_limited',
        detail,
        used: rate.used,
        limit: rate.limit,
        isPro: user.isPro,
        retryAfterSeconds: rate.retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          'content-type': 'application/json',
          'retry-after': String(rate.retryAfterSeconds),
        },
      }
    );
  }

  // Drop every image part EXCEPT the current turn's. Historical images live
  // as device-local file:// URIs and aren't fetchable from the server, so
  // they can't go to either model. The current user message's image is a
  // base64 data URL that the server can read inline.
  const lastUserIdx = findLastUserIndex(body.messages);
  const messagesForModel = body.messages.map((m, i) =>
    i === lastUserIdx ? m : stripImageInMessage(m)
  );

  let modelMessages;
  try {
    modelMessages = await convertToModelMessages(messagesForModel);
  } catch (e: any) {
    console.warn('[api/chat] message conversion failed:', e?.message ?? e);
    return new Response(
      JSON.stringify({ error: 'Could not process messages' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  // draft_email is always available (free, zero marginal cost — it just
  // structures the model's output for the client to render as a sendable
  // card). web_search is added only when Pro + toggled on.
  const tools = {
    draft_email: tool({
      description:
        'Draft an email when the user asks you to write/compose/reply to an email. Produces a structured draft the user reviews and sends from their own mail app.',
      inputSchema: z.object({
        to: z.string().optional().describe('Recipient email address, if the user specified one.'),
        subject: z.string().describe('A clear, specific subject line.'),
        body: z.string().describe('The full email body as plain text, ready to send.'),
      }),
      execute: async ({ to, subject, body }) => {
        // Nothing to do server-side — echo the structured draft back so it
        // streams to the client, which renders the sendable card.
        return { to: to ?? '', subject, body };
      },
    }),
    draft_event: tool({
      description:
        'Draft a calendar event when the user asks to schedule something, set a reminder, or create an event. Produces a structured event the user adds to their own calendar.',
      inputSchema: z.object({
        title: z.string().describe('Short event title.'),
        startISO: z.string().describe('Start datetime in ISO 8601 (resolve relative dates against the current date/time provided).'),
        endISO: z.string().optional().describe('End datetime in ISO 8601. Omit if unknown.'),
        location: z.string().optional().describe('Location, if mentioned.'),
        notes: z.string().optional().describe('Any extra details/agenda.'),
      }),
      execute: async ({ title, startISO, endISO, location, notes }) => ({
        title,
        startISO,
        endISO: endISO ?? '',
        location: location ?? '',
        notes: notes ?? '',
      }),
    }),
    ...(wantsSearch
      ? {
          web_search: tool({
            description:
              'Search the web for current, up-to-date information. Use for recent events, current facts/data, or anything you are not confident about. Returns sources with extracted content.',
            inputSchema: z.object({
              query: z
                .string()
                .describe('Concise search keywords, like you would type into a search engine.'),
            }),
            execute: async ({ query }) => {
              const rl = recordSearchAndCheck(user.userId, user.isPro);
              if (!rl.ok) {
                return { error: 'Daily web search limit reached. It resets within 24 hours.' };
              }
              const result = await searchWeb(query, { maxResults: 5 });
              if ('error' in result) return { error: result.error };
              return {
                query,
                answer: result.answer,
                // Trim per-source content so we don't blow the context window.
                sources: result.sources.map((s) => ({
                  title: s.title,
                  url: s.url,
                  content: s.content.slice(0, 1200),
                })),
              };
            },
          }),
        }
      : {}),
  };

  // Model selection: image turns → Gemini (DeepSeek is text-only);
  // deep-think → reasoner; otherwise → flash. Tools run only on flash
  // (reasoner + image turns are tool-free for reliability).
  const toolFree = isReasoner || hasImage;
  const model = hasImage
    ? google(env('GEMINI_MODEL') ?? GEMINI_VISION_MODEL)
    : // .chat() forces /v1/chat/completions (DeepSeek doesn't implement /v1/responses).
      deepseek.chat(modelId);

  // Give the model the current date/time so it can resolve relative dates
  // (e.g. for draft_event "tomorrow at 3pm").
  const nowLine = `\n\nCurrent date/time: ${new Date().toISOString()} (UTC).`;
  const system =
    (toolFree
      ? ARCHIUS_SYSTEM_PROMPT
      : ARCHIUS_SYSTEM_PROMPT +
        (wantsSearch ? WEB_SEARCH_SYSTEM_ADDENDUM : NO_WEB_SEARCH_SYSTEM_ADDENDUM)) + nowLine;

  try {
    const result = streamText({
      model,
      system,
      messages: modelMessages,
      tools: toolFree ? undefined : tools,
      // Allow the search → synthesize multi-step loop (search, read results,
      // optionally search again, then answer). Capped so it can't loop forever.
      stopWhen: stepCountIs(4),
      onError: ({ error }) => {
        console.warn('[api/chat] streamText error:', error);
      },
    });
    return result.toUIMessageStreamResponse({
      onError: () => 'The AI service could not complete this response.',
    });
  } catch (e: any) {
    console.warn('[api/chat] stream setup failed:', e?.message ?? e);
    return new Response(
      JSON.stringify({ error: 'The AI service could not start this response' }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
