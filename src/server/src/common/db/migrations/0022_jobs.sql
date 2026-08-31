CREATE TABLE IF NOT EXISTS jobs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  code        TEXT NOT NULL DEFAULT '',
  draft_code  TEXT,
  cron        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 0,
  timeout_ms  INTEGER NOT NULL DEFAULT 300000,
  next_run_at INTEGER,
  last_run_at INTEGER,
  lease_owner TEXT,
  lease_until INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_jobs_enabled_next_run ON jobs(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_lease_until ON jobs(lease_until);
