CREATE TABLE IF NOT EXISTS agent_messages (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id TEXT REFERENCES agent_conversations(id) ON DELETE CASCADE,
  chat_agent_id   TEXT,
  role            TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','assistant','tool','thinking')),
  content         TEXT NOT NULL,
  metadata        TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
