CREATE TABLE IF NOT EXISTS api_keys (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  key_prefix               TEXT NOT NULL,
  key_hash                 TEXT NOT NULL UNIQUE,
  created_by               TEXT NOT NULL,
  created_at               INTEGER NOT NULL DEFAULT (unixepoch()),
  last_used_at             INTEGER,
  revoked_at               INTEGER,
  agents_unrestricted      INTEGER NOT NULL DEFAULT 0,
  datatables_unrestricted  INTEGER NOT NULL DEFAULT 0,
  kv_unrestricted          INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
