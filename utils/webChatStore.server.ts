import { neon } from '@neondatabase/serverless';
import { env } from '@/utils/env';
import type { Message } from '@/utils/Interfaces';
import { Role } from '@/utils/Interfaces';

type ChatRow = { id: number; title: string; updated_at: string | Date | null };
type MessageRow = {
  content: string;
  role: 'user' | 'bot';
  sources: Message['sources'] | null;
  email: Message['email'] | null;
  event: Message['event'] | null;
  image_uri: string | null;
};

const database = () => {
  const url = env('DATABASE_URL');
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
};

const serializeChat = (row: ChatRow) => ({
  id: Number(row.id),
  title: row.title,
  updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
});

export const listWebChats = async (userId: string, query?: string) => {
  const sql = database();
  const rows = query
    ? await sql`
        SELECT DISTINCT c.id, c.title, c.updated_at
          FROM web_chats c
         WHERE c.user_id = ${userId}
           AND (
             c.title ILIKE ${`%${query}%`}
             OR EXISTS (
               SELECT 1 FROM web_messages m
                WHERE m.chat_id = c.id AND m.content ILIKE ${`%${query}%`}
             )
           )
         ORDER BY c.updated_at DESC, c.id DESC
      `
    : await sql`
        SELECT id, title, updated_at
          FROM web_chats
         WHERE user_id = ${userId}
         ORDER BY updated_at DESC, id DESC
      `;
  return (rows as ChatRow[]).map(serializeChat);
};

export const findWebChat = async (userId: string, chatId: number) => {
  const sql = database();
  const rows = await sql`
    SELECT id, title, updated_at
      FROM web_chats
     WHERE id = ${chatId} AND user_id = ${userId}
     LIMIT 1
  `;
  return rows[0] ? serializeChat(rows[0] as ChatRow) : null;
};

export const createWebChat = async (userId: string, title: string) => {
  const sql = database();
  const rows = await sql`
    INSERT INTO web_chats (user_id, title)
    VALUES (${userId}, ${title})
    RETURNING id, title, updated_at
  `;
  return serializeChat(rows[0] as ChatRow);
};

export const listWebMessages = async (userId: string, chatId: number): Promise<Message[]> => {
  const sql = database();
  const rows = await sql`
    SELECT m.content, m.role, m.sources, m.email, m.event, m.image_uri
      FROM web_messages m
      JOIN web_chats c ON c.id = m.chat_id
     WHERE m.chat_id = ${chatId} AND c.user_id = ${userId}
     ORDER BY m.id ASC
  `;
  return (rows as MessageRow[]).map((row) => ({
    content: row.content,
    role: row.role === 'bot' ? Role.Bot : Role.User,
    sources: row.sources ?? undefined,
    email: row.email ?? undefined,
    event: row.event ?? undefined,
    imageUri: row.image_uri ?? undefined,
  }));
};

export const appendWebMessage = async (userId: string, chatId: number, message: Message) => {
  const sql = database();
  const rows = await sql`
    WITH owned_chat AS (
      UPDATE web_chats
         SET updated_at = NOW()
       WHERE id = ${chatId} AND user_id = ${userId}
       RETURNING id
    )
    INSERT INTO web_messages (chat_id, content, role, sources, email, event, image_uri)
    SELECT id,
           ${message.content},
           ${message.role === Role.Bot ? 'bot' : 'user'},
           ${message.sources ? JSON.stringify(message.sources) : null}::jsonb,
           ${message.email ? JSON.stringify(message.email) : null}::jsonb,
           ${message.event ? JSON.stringify(message.event) : null}::jsonb,
           ${message.imageUri ?? null}
      FROM owned_chat
    RETURNING id
  `;
  if (rows.length !== 1) throw new Error('Chat not found');
};

export const renameWebChat = async (userId: string, chatId: number, title: string) => {
  const sql = database();
  const rows = await sql`
    UPDATE web_chats SET title = ${title}, updated_at = NOW()
     WHERE id = ${chatId} AND user_id = ${userId}
    RETURNING id
  `;
  if (rows.length !== 1) throw new Error('Chat not found');
};

export const removeWebChat = async (userId: string, chatId: number) => {
  const sql = database();
  const rows = await sql`
    DELETE FROM web_chats
     WHERE id = ${chatId} AND user_id = ${userId}
    RETURNING id
  `;
  if (rows.length !== 1) throw new Error('Chat not found');
};

export const truncateWebMessages = async (
  userId: string,
  chatId: number,
  count: number
) => {
  if (count <= 0) return;
  const sql = database();
  const owned = await findWebChat(userId, chatId);
  if (!owned) throw new Error('Chat not found');
  await sql`
    DELETE FROM web_messages
     WHERE id IN (
       SELECT m.id
         FROM web_messages m
        WHERE m.chat_id = ${chatId}
        ORDER BY m.id DESC
        LIMIT ${count}
     )
  `;
};

export const removeAllWebChats = async (userId: string) => {
  const sql = database();
  await sql`DELETE FROM web_chats WHERE user_id = ${userId}`;
};
