import { z } from 'zod';
import { authenticate } from '@/utils/serverAuth';
import {
  appendWebMessage,
  createWebChat,
  findWebChat,
  listWebChats,
  listWebMessages,
  removeAllWebChats,
  removeWebChat,
  renameWebChat,
  truncateWebMessages,
} from '@/utils/webChatStore.server';

const MAX_BODY_BYTES = 4 * 1024 * 1024;

const sourceSchema = z.object({ title: z.string().max(500), url: z.string().url().max(2_000) });
const emailSchema = z.object({
  to: z.string().max(320).optional(),
  subject: z.string().max(500),
  body: z.string().max(30_000),
});
const eventSchema = z.object({
  title: z.string().max(500),
  startISO: z.string().max(100),
  endISO: z.string().max(100).optional(),
  location: z.string().max(1_000).optional(),
  notes: z.string().max(10_000).optional(),
});
const messageSchema = z.object({
  role: z.union([z.literal(0), z.literal(1)]),
  content: z.string().max(120_000),
  sources: z.array(sourceSchema).max(20).optional(),
  email: emailSchema.optional(),
  event: eventSchema.optional(),
  imageUri: z.string().max(3_750_000).optional(),
});
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create_chat'), title: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal('add_message'), chatId: z.number().int().positive(), message: messageSchema }),
  z.object({ action: z.literal('delete_chat'), chatId: z.number().int().positive() }),
  z.object({ action: z.literal('rename_chat'), chatId: z.number().int().positive(), title: z.string().trim().min(1).max(100) }),
  z.object({ action: z.literal('delete_last_messages'), chatId: z.number().int().positive(), count: z.number().int().min(0).max(100) }),
  z.object({ action: z.literal('delete_all') }),
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

export async function GET(req: Request) {
  const user = await authenticate(req);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  try {
    const url = new URL(req.url);
    const chatIdValue = url.searchParams.get('chatId');
    const chatId = chatIdValue ? Number(chatIdValue) : null;
    if (chatIdValue && (!Number.isInteger(chatId) || Number(chatId) <= 0)) {
      return json({ error: 'Invalid chat id' }, 400);
    }

    if (chatId && url.searchParams.get('messages') === '1') {
      const chat = await findWebChat(user.userId, chatId);
      if (!chat) return json({ error: 'Chat not found' }, 404);
      return json({ messages: await listWebMessages(user.userId, chatId) });
    }
    if (chatId) return json({ chat: await findWebChat(user.userId, chatId) });

    const query = url.searchParams.get('q')?.trim().slice(0, 200);
    return json({ chats: await listWebChats(user.userId, query || undefined) });
  } catch (error: any) {
    console.warn('[api/chats] GET failed:', error?.message ?? error);
    return json({ error: 'Could not load chats' }, 500);
  }
}

export async function POST(req: Request) {
  const user = await authenticate(req);
  if (!user) return json({ error: 'Unauthorized' }, 401);

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ error: 'Request body is too large' }, 413);
  }

  let raw = '';
  try {
    raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return json({ error: 'Request body is too large' }, 413);
    }
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const result = actionSchema.safeParse(parsed);
  if (!result.success) return json({ error: 'Invalid action' }, 400);

  try {
    const action = result.data;
    switch (action.action) {
      case 'create_chat':
        return json({ chat: await createWebChat(user.userId, action.title) }, 201);
      case 'add_message':
        await appendWebMessage(user.userId, action.chatId, action.message);
        return json({ ok: true });
      case 'delete_chat':
        await removeWebChat(user.userId, action.chatId);
        return json({ ok: true });
      case 'rename_chat':
        await renameWebChat(user.userId, action.chatId, action.title);
        return json({ ok: true });
      case 'delete_last_messages':
        await truncateWebMessages(user.userId, action.chatId, action.count);
        return json({ ok: true });
      case 'delete_all':
        await removeAllWebChats(user.userId);
        return json({ ok: true });
    }
  } catch (error: any) {
    const message = error?.message ?? 'Could not update chats';
    console.warn('[api/chats] POST failed:', message);
    return json({ error: message === 'Chat not found' ? message : 'Could not update chats' }, message === 'Chat not found' ? 404 : 500);
  }
}
