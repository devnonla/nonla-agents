CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  avatar              TEXT,
  system_prompt       TEXT,
  system_prompt_draft TEXT,
  is_active           INTEGER NOT NULL DEFAULT 1,
  is_public           INTEGER NOT NULL DEFAULT 0,
  public_password     TEXT,
  ai_provider         TEXT,
  ai_model            TEXT,
  callable_agent_ids  TEXT NOT NULL DEFAULT '[]',
  team_id             TEXT REFERENCES agent_teams(id) ON DELETE SET NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  created_by          TEXT,
  created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);
