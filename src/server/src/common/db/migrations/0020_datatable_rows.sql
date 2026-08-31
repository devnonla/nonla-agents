CREATE TABLE IF NOT EXISTS datatable_rows (
  id         TEXT PRIMARY KEY,
  table_id   TEXT NOT NULL REFERENCES datatable_tables(id) ON DELETE CASCADE,
  data       TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_datatable_rows_table ON datatable_rows(table_id);
