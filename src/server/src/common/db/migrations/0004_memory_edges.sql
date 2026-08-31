CREATE TABLE IF NOT EXISTS memory_edges (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  owner_id   TEXT NOT NULL DEFAULT 'user',
  from_id    TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  to_id      TEXT NOT NULL REFERENCES memory_nodes(id) ON DELETE CASCADE,
  relation   TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (from_id, to_id, relation)
);

CREATE INDEX IF NOT EXISTS idx_memory_edges_agent_owner ON memory_edges(agent_id, owner_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_from ON memory_edges(from_id);
CREATE INDEX IF NOT EXISTS idx_memory_edges_to ON memory_edges(to_id);
