CREATE TABLE IF NOT EXISTS api_key_datatable_projects (
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES datatable_projects(id) ON DELETE CASCADE,
  PRIMARY KEY (api_key_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_api_key_datatable_projects_project ON api_key_datatable_projects(project_id);
