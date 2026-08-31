CREATE TABLE IF NOT EXISTS sites (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  is_published      INTEGER NOT NULL DEFAULT 0,
  public_password   TEXT,
  deps_status       TEXT NOT NULL DEFAULT 'ready',
  deps_error        TEXT,
  draft_deps_status TEXT NOT NULL DEFAULT 'ready',
  draft_deps_error  TEXT,
  draft_updated_at  INTEGER,
  created_by        TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_sites_slug ON sites(slug);
