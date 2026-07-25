import {
  type EmailDraft,
  type EventDraft,
  Message,
  type MessageSource,
  Role,
} from '@/utils/Interfaces';
import { type SQLiteDatabase } from 'expo-sqlite';

const DATABASE_VERSION = 7;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  // Foreign keys are off by default per connection in SQLite. We MUST
  // enable them here so ON DELETE CASCADE on messages.chat_id fires.
  // (PRAGMA can't run inside a transaction, so it goes first.)
  await db.execAsync('PRAGMA foreign_keys = ON;');
  // WAL must also be set OUTSIDE any transaction — SQLite hard-errors with
  // "cannot change into wal mode from within a transaction" otherwise. This
  // was inside the v0 migration block and crashed every FRESH install at
  // first sign-in (App Review rejection; existing installs already had a
  // WAL database so never hit it). Idempotent: no-op when already in WAL.
  await db.execAsync("PRAGMA journal_mode = 'wal';");

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentDbVersion = result?.user_version ?? 0;

  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  // Run the whole migration in a transaction so we can't end up half-applied
  // (crash between ALTER TABLE and the PRAGMA user_version bump = bricked DB
  // on the next launch). withTransactionAsync rolls back on throw.
  await db.withTransactionAsync(async () => {
    let v = currentDbVersion;

    if (v === 0) {
      await db.execAsync(`
CREATE TABLE chats (
  id INTEGER PRIMARY KEY NOT NULL,
  title TEXT NOT NULL
);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY NOT NULL,
  chat_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  role TEXT NOT NULL,
  FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
);
`);
      v = 1;
    }

    if (v === 1) {
      // v2: add updated_at to chats for date grouping in the drawer.
      // The ALTER TABLE is NOT idempotent — make it so by checking for the
      // column first. (table_info pragma returns one row per column.)
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(chats)`
      );
      const hasUpdatedAt = cols.some((c) => c.name === 'updated_at');
      if (!hasUpdatedAt) {
        await db.execAsync(`ALTER TABLE chats ADD COLUMN updated_at TEXT;`);
      }
      await db.runAsync(
        `UPDATE chats SET updated_at = datetime('now') WHERE updated_at IS NULL;`
      );
      // Helpful indexes for searchChats LIKE scans + ordering.
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);`
      );
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at);`
      );
      v = 2;
    }

    if (v === 2) {
      // v3: store cited web-search sources per message (JSON-encoded).
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(messages)`
      );
      const hasSources = cols.some((c) => c.name === 'sources');
      if (!hasSources) {
        await db.execAsync(`ALTER TABLE messages ADD COLUMN sources TEXT;`);
      }
      v = 3;
    }

    if (v === 3) {
      // v4: store a drafted email per message (JSON-encoded).
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(messages)`
      );
      const hasEmail = cols.some((c) => c.name === 'email');
      if (!hasEmail) {
        await db.execAsync(`ALTER TABLE messages ADD COLUMN email TEXT;`);
      }
      v = 4;
    }

    if (v === 4) {
      // v5: store a drafted calendar event per message (JSON-encoded).
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(messages)`
      );
      const hasEvent = cols.some((c) => c.name === 'event');
      if (!hasEvent) {
        await db.execAsync(`ALTER TABLE messages ADD COLUMN event TEXT;`);
      }
      v = 5;
    }

    if (v === 5) {
      // v6: persisted local file URI for user-attached images.
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(messages)`
      );
      const hasImageUri = cols.some((c) => c.name === 'image_uri');
      if (!hasImageUri) {
        await db.execAsync(`ALTER TABLE messages ADD COLUMN image_uri TEXT;`);
      }
      v = 6;
    }

    if (v === 6) {
      // v7: scope chats to the signed-in Clerk user so a second account on
      // the same device doesn't see the first account's history. Legacy rows
      // (NULL user_id) are claimed by the next user who signs in — see
      // claimLegacyChats.
      const cols = await db.getAllAsync<{ name: string }>(
        `PRAGMA table_info(chats)`
      );
      const hasUserId = cols.some((c) => c.name === 'user_id');
      if (!hasUserId) {
        await db.execAsync(`ALTER TABLE chats ADD COLUMN user_id TEXT;`);
      }
      await db.execAsync(
        `CREATE INDEX IF NOT EXISTS idx_chats_user_id ON chats(user_id);`
      );
      v = 7;
    }

    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}

// ---------------------------------------------------------------------------
// Per-user scoping. The drawer/chat call sites don't thread the Clerk userId
// through every query, so the signed-in user is registered once (by the
// (auth) layout, which only mounts when authenticated) and queries read it.
let activeChatUserId: string | null = null;

export const setActiveChatUser = (userId: string | null) => {
  activeChatUserId = userId;
};

const requireActiveChatUser = (): string => {
  if (!activeChatUserId) {
    throw new Error('No signed-in chat user is active');
  }
  return activeChatUserId;
};

// One-time adoption of rows created before v7 (user_id NULL). The first
// account that signs in after the update owns them — on single-user devices
// (the overwhelming case) that's exactly the person who created them.
export const claimLegacyChats = async (db: SQLiteDatabase, userId: string) => {
  await db.runAsync('UPDATE chats SET user_id = ? WHERE user_id IS NULL', userId);
};

const nowIso = () => new Date().toISOString();

export const addChat = async (db: SQLiteDatabase, title: string) => {
  const userId = requireActiveChatUser();
  return await db.runAsync(
    'INSERT INTO chats (title, updated_at, user_id) VALUES (?, ?, ?)',
    title,
    nowIso(),
    userId
  );
};

export const getChats = async (db: SQLiteDatabase) => {
  const userId = requireActiveChatUser();
  return await db.getAllAsync<{ id: number; title: string; updated_at: string | null }>(
    'SELECT * FROM chats WHERE user_id = ? ORDER BY COALESCE(updated_at, datetime(0)) DESC, id DESC',
    userId
  );
};

export const getChat = async (db: SQLiteDatabase, chatId: number) => {
  const userId = requireActiveChatUser();
  return await db.getFirstAsync<{ id: number; title: string; updated_at: string | null }>(
    'SELECT id, title, updated_at FROM chats WHERE id = ? AND user_id = ?',
    chatId,
    userId
  );
};

const parseSources = (raw: string | null): MessageSource[] | undefined => {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed
        .filter((s) => s && typeof s.url === 'string')
        .map((s) => ({ title: String(s.title ?? s.url), url: String(s.url) }));
    }
  } catch {
    // ignore malformed JSON
  }
  return undefined;
};

const parseEmail = (raw: string | null): EmailDraft | undefined => {
  if (!raw) return undefined;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.subject === 'string' && typeof p.body === 'string') {
      return {
        to: typeof p.to === 'string' ? p.to : undefined,
        subject: p.subject,
        body: p.body,
      };
    }
  } catch {
    // ignore malformed JSON
  }
  return undefined;
};

const parseEvent = (raw: string | null): EventDraft | undefined => {
  if (!raw) return undefined;
  try {
    const p = JSON.parse(raw);
    if (p && typeof p.title === 'string' && typeof p.startISO === 'string') {
      return {
        title: p.title,
        startISO: p.startISO,
        endISO: typeof p.endISO === 'string' ? p.endISO : undefined,
        location: typeof p.location === 'string' ? p.location : undefined,
        notes: typeof p.notes === 'string' ? p.notes : undefined,
      };
    }
  } catch {
    // ignore malformed JSON
  }
  return undefined;
};

export const getMessages = async (db: SQLiteDatabase, chatId: number): Promise<Message[]> => {
  const userId = requireActiveChatUser();
  const rows = await db.getAllAsync<{
    content: string;
    role: string;
    sources: string | null;
    email: string | null;
    event: string | null;
    image_uri: string | null;
  }>(
    `SELECT m.content, m.role, m.sources, m.email, m.event, m.image_uri
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
      WHERE m.chat_id = ? AND c.user_id = ?
      ORDER BY m.id ASC`,
    chatId,
    userId
  );
  return rows.map((row) => ({
    content: row.content,
    role: row.role === 'bot' ? Role.Bot : Role.User,
    sources: parseSources(row.sources),
    email: parseEmail(row.email),
    event: parseEvent(row.event),
    imageUri: row.image_uri ?? undefined,
  }));
};

export const addMessage = async (
  db: SQLiteDatabase,
  chatId: number,
  { content, role, sources, email, event, imageUri }: Message
) => {
  const userId = requireActiveChatUser();
  // Transactional so the chat's updated_at bump and the message INSERT
  // can't end up split (which would show a "recently updated" chat with no
  // new message in the drawer).
  const sourcesJson = sources && sources.length > 0 ? JSON.stringify(sources) : null;
  const emailJson = email ? JSON.stringify(email) : null;
  const eventJson = event ? JSON.stringify(event) : null;
  await db.withTransactionAsync(async () => {
    const ownedChat = await db.runAsync(
      'UPDATE chats SET updated_at = ? WHERE id = ? AND user_id = ?',
      nowIso(),
      chatId,
      userId
    );
    if (ownedChat.changes !== 1) {
      throw new Error('Chat not found for the active user');
    }
    await db.runAsync(
      'INSERT INTO messages (chat_id, content, role, sources, email, event, image_uri) VALUES (?, ?, ?, ?, ?, ?, ?)',
      chatId,
      content,
      role === Role.Bot ? 'bot' : 'user',
      sourcesJson,
      emailJson,
      eventJson,
      imageUri ?? null
    );
  });
};

export const deleteChat = async (db: SQLiteDatabase, chatId: number) => {
  const userId = requireActiveChatUser();
  // Collect persisted image file paths BEFORE the cascade so we can clean
  // up the files. (Doing this after delete would lose the URIs.)
  let imageUris: string[] = [];
  try {
    const rows = await db.getAllAsync<{ image_uri: string | null }>(
      `SELECT m.image_uri
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
        WHERE m.chat_id = ? AND c.user_id = ? AND m.image_uri IS NOT NULL`,
      chatId,
      userId
    );
    imageUris = rows.map((r) => r.image_uri).filter((u): u is string => !!u);
  } catch {
    // ignore — file cleanup is best-effort
  }

  // ON DELETE CASCADE handles messages, since PRAGMA foreign_keys=ON is set
  // in migrateDbIfNeeded. Still safe-belt the message cleanup in case the
  // pragma ever regresses.
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM messages
        WHERE chat_id = ?
          AND EXISTS (
                SELECT 1 FROM chats
                 WHERE chats.id = messages.chat_id AND chats.user_id = ?
              )`,
      chatId,
      userId
    );
    const deleted = await db.runAsync(
      'DELETE FROM chats WHERE id = ? AND user_id = ?',
      chatId,
      userId
    );
    if (deleted.changes !== 1) {
      throw new Error('Chat not found for the active user');
    }
  });

  await deleteImageUris(imageUris);
};

export const renameChat = async (db: SQLiteDatabase, chatId: number, title: string) => {
  const userId = requireActiveChatUser();
  const result = await db.runAsync(
    'UPDATE chats SET title = ? WHERE id = ? AND user_id = ?',
    title,
    chatId,
    userId
  );
  if (result.changes !== 1) {
    throw new Error('Chat not found for the active user');
  }
  return result;
};

// Delete the most recent `count` messages from the chat (used by message
// edit, which truncates from the edited index forward).
export const deleteLastNMessages = async (
  db: SQLiteDatabase,
  chatId: number,
  count: number
) => {
  if (count <= 0) return;
  const userId = requireActiveChatUser();
  return await db.runAsync(
    `DELETE FROM messages WHERE id IN (
       SELECT m.id
         FROM messages m
         JOIN chats c ON c.id = m.chat_id
        WHERE m.chat_id = ? AND c.user_id = ?
        ORDER BY m.id DESC
        LIMIT ?
     )`,
    chatId,
    userId,
    count
  );
};

// Search across chat titles AND message contents. Returns distinct chats
// whose title matches OR who have a message containing the query.
export const searchChats = async (db: SQLiteDatabase, query: string) => {
  const userId = requireActiveChatUser();
  const q = `%${query.toLowerCase()}%`;
  return await db.getAllAsync<{ id: number; title: string; updated_at: string | null }>(
    `SELECT c.id, c.title, c.updated_at
       FROM chats c
      WHERE c.user_id = ?
        AND (LOWER(c.title) LIKE ?
         OR EXISTS (
              SELECT 1 FROM messages m
               WHERE m.chat_id = c.id AND LOWER(m.content) LIKE ?
             ))
      ORDER BY COALESCE(c.updated_at, datetime(0)) DESC, c.id DESC`,
    userId,
    q,
    q
  );
};

const deleteImageUris = async (imageUris: string[]) => {
  if (imageUris.length === 0) return;
  try {
    const FileSystem: any = await import('expo-file-system/legacy');
    await Promise.all(
      imageUris.map((uri) =>
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)
      )
    );
  } catch {
    // Best-effort cleanup: database ownership/deletion must not depend on the
    // native filesystem module being available.
  }
};

/**
 * Deletes only one Clerk user's local chats and their referenced image files.
 * The caller passes the user id captured before Clerk account deletion, since
 * deleting the account can immediately clear the active auth state.
 */
export const deleteUserChats = async (db: SQLiteDatabase, userId: string) => {
  if (!userId) throw new Error('A user id is required to delete local chats');

  const rows = await db.getAllAsync<{ image_uri: string | null }>(
    `SELECT m.image_uri
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
      WHERE c.user_id = ? AND m.image_uri IS NOT NULL`,
    userId
  );
  const imageUris = rows.map((row) => row.image_uri).filter((uri): uri is string => !!uri);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM messages
        WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)`,
      userId
    );
    await db.runAsync('DELETE FROM chats WHERE user_id = ?', userId);
  });

  await deleteImageUris(imageUris);
};

// Group chats into buckets based on updated_at relative to "now".
// Buckets use the device's local-time day boundaries.
export type ChatBucket = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

export const bucketChat = (updatedAt: string | null): ChatBucket => {
  if (!updatedAt) return 'earlier';
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return 'earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfWeek = startOfToday - 6 * 24 * 60 * 60 * 1000;
  if (t >= startOfToday) return 'today';
  if (t >= startOfYesterday) return 'yesterday';
  if (t >= startOfWeek) return 'thisWeek';
  return 'earlier';
};

export const BUCKET_LABELS: Record<ChatBucket, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This Week',
  earlier: 'Earlier',
};
