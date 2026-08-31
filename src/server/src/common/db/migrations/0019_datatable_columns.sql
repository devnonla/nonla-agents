CREATE TABLE IF NOT EXISTS datatable_columns (
  id         TEXT PRIMARY KEY,
  table_id   TEXT NOT NULL REFERENCES datatable_tables(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  options    TEXT,
  required   INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (table_id, name)
);

CREATE INDEX IF NOT EXISTS idx_datatable_columns_table ON datatable_columns(table_id);
