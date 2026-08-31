CREATE TABLE IF NOT EXISTS llm_providers (
  id              TEXT PRIMARY KEY,
  provider        TEXT NOT NULL,
  label           TEXT NOT NULL,
  api_key         TEXT NOT NULL DEFAULT '',
  custom_base_url TEXT NOT NULL DEFAULT '',
  models          TEXT NOT NULL DEFAULT '[]',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
