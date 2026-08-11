import assert from 'node:assert/strict';
import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const sql = neon(databaseUrl);
const userId = `codex_smoke_${Date.now()}`;

try {
  const created = await sql`
    INSERT INTO web_chats (user_id, title)
    VALUES (${userId}, ${'Web sync smoke test'})
    RETURNING id, title
  `;
  assert.equal(created.length, 1);
  const chatId = Number(created[0].id);

  const inserted = await sql`
    INSERT INTO web_messages (chat_id, content, role)
    VALUES (${chatId}, ${'hello'}, ${'user'})
    RETURNING id
  `;
  assert.equal(inserted.length, 1);

  const visible = await sql`
    SELECT c.id, c.title, COUNT(m.id)::int AS message_count
      FROM web_chats c
      LEFT JOIN web_messages m ON m.chat_id = c.id
     WHERE c.id = ${chatId} AND c.user_id = ${userId}
     GROUP BY c.id, c.title
  `;
  assert.equal(visible.length, 1);
  assert.equal(Number(visible[0].message_count), 1);

  const hidden = await sql`
    SELECT id FROM web_chats WHERE id = ${chatId} AND user_id = ${'another_user'}
  `;
  assert.equal(hidden.length, 0);

  console.log('Web database smoke test passed.');
} finally {
  await sql`DELETE FROM web_chats WHERE user_id = ${userId}`;
}
