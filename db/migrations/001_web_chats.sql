CREATE TABLE IF NOT EXISTS web_chats (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS web_chats_user_updated_idx
  ON web_chats (user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS web_messages (
  id SERIAL PRIMARY KEY,
  chat_id INTEGER NOT NULL REFERENCES web_chats(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'bot')),
  sources JSONB,
  email JSONB,
  event JSONB,
  image_uri TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS web_messages_chat_id_idx
  ON web_messages (chat_id, id);

CREATE INDEX IF NOT EXISTS web_messages_search_idx
  ON web_messages USING GIN (to_tsvector('english', content));
