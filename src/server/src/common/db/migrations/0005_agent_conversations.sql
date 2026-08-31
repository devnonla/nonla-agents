CREATE TABLE IF NOT EXISTS agent_conversations (
  id                 TEXT PRIMARY KEY,
  agent_id           TEXT REFERENCES agents(id) ON DELETE SET NULL,
  owner_id           TEXT NOT NULL DEFAULT 'user',
  title              TEXT NOT NULL,
  trigger            TEXT NOT NULL DEFAULT 'manual' CHECK(trigger IN ('manual','cron','api','meeting','public')),
  status             TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','done','failed')),
  error_message      TEXT,
  summary            TEXT,
  summary_updated_at INTEGER,
  started_at         INTEGER,
  finished_at        INTEGER,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch())
);
