CREATE TABLE IF NOT EXISTS datatable_tables (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES datatable_projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (project_id, name)
);

CREATE INDEX IF NOT EXISTS idx_datatable_tables_project ON datatable_tables(project_id);
