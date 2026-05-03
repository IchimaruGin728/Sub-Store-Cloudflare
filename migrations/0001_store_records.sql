CREATE TABLE IF NOT EXISTS store_records (
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, name)
);

CREATE INDEX IF NOT EXISTS idx_store_records_scope_updated_at
  ON store_records(scope, updated_at DESC);
