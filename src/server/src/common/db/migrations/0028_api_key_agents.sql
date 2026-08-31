CREATE TABLE IF NOT EXISTS api_key_agents (
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  agent_id   TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  PRIMARY KEY (api_key_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_api_key_agents_agent ON api_key_agents(agent_id);
