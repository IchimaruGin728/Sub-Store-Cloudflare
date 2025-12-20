-- 迁移: 添加 token_version 列用于 Token 失效控制
-- 改密码时 token_version +1，使所有旧 Token 失效

ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0;
