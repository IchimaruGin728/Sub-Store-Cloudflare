-- 迁移表：跟踪已执行的迁移
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
