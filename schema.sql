-- Sub-Store D1 数据库表结构 (Multi-Tenant)
-- 运行: bun run db:init:local

-- 用户表 (每用户独立 Sub-Store)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user', -- 'admin' or 'user'
  path TEXT UNIQUE NOT NULL, -- 用户专属访问路径 (自动生成，管理员可改)
  data TEXT DEFAULT '{}',    -- 用户的 Sub-Store 完整配置 (JSON)
  notes TEXT DEFAULT '',     -- 管理员备注 (仅管理员可见)
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_path ON users(path);

-- 验证码表 (临时存储)
CREATE TABLE IF NOT EXISTS captchas (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  expires_at INTEGER NOT NULL
);

-- 自动清理过期验证码的索引
CREATE INDEX IF NOT EXISTS idx_captchas_expires ON captchas(expires_at);

-- 系统设置表 (单行存储所有设置)
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- 确保只有一行
  settings TEXT DEFAULT '{}',              -- JSON 格式存储所有设置
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- 初始化空设置行
INSERT OR IGNORE INTO system_settings (id) VALUES (1);
