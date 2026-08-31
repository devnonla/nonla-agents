CREATE TABLE IF NOT EXISTS memory_nodes (
  id                     TEXT PRIMARY KEY,
  agent_id               TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id               TEXT NOT NULL DEFAULT 'user',
  content                TEXT NOT NULL,
  source_conversation_id TEXT,
  created_at             INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at             INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_memory_nodes_agent_owner ON memory_nodes(agent_id, owner_id);
