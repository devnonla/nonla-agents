CREATE TABLE IF NOT EXISTS agent_tool_assignments (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tool_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
