CREATE TABLE IF NOT EXISTS api_key_kv_entries (
  api_key_id  TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  kv_entry_id TEXT NOT NULL REFERENCES kv_store(id) ON DELETE CASCADE,
  PRIMARY KEY (api_key_id, kv_entry_id)
);

CREATE INDEX IF NOT EXISTS idx_api_key_kv_entries_kv ON api_key_kv_entries(kv_entry_id);
