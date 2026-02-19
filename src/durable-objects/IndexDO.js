import { DurableObject } from 'cloudflare:workers';
import { Storage } from '@cloudflare/actors/storage';
import { getRequestId, initLogger, debug, error as logError } from '../utils/logger.js';
import { errorResponse } from '../atoms/http/httpAtoms.js';
import { handle as handleIndexDoRequest } from '../orchestration/commander/indexDoCommander.js';

const INDEX_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  path TEXT UNIQUE NOT NULL,
  notes TEXT DEFAULT '',
  token_version INTEGER DEFAULT 0,
  avatar_url TEXT DEFAULT '',
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_path ON users(path);

CREATE TABLE IF NOT EXISTS captchas (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_captchas_expires ON captchas(expires_at);

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  settings TEXT DEFAULT '{}',
  updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO system_settings (id, settings, updated_at) VALUES (1, '{}', (strftime('%s', 'now') * 1000));

-- GeoIP MMDB cache (shared across all users)
CREATE TABLE IF NOT EXISTS mmdb_files (
  name TEXT PRIMARY KEY,
  etag TEXT,
  updated_at INTEGER NOT NULL,
  data BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mmdb_files_updated ON mmdb_files(updated_at);

-- GeoIP MMDB cache (chunked; avoids SQLITE_TOOBIG for ~10MB files)
CREATE TABLE IF NOT EXISTS mmdb_meta (
  name TEXT PRIMARY KEY,
  etag TEXT,
  updated_at INTEGER NOT NULL,
  source_url TEXT,
  build_epoch INTEGER,
  total_size INTEGER NOT NULL,
  chunk_size INTEGER NOT NULL,
  chunks INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mmdb_chunks (
  name TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (name, idx)
);
CREATE INDEX IF NOT EXISTS idx_mmdb_chunks_name ON mmdb_chunks(name);
`;

/**
 * IndexDO（全局 Durable Object）
 */
export class IndexDO extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.state = state;
        this.env = env;
        this.storage = new Storage(state.storage);
        // 建表（多语句 DDL 直接走底层 sql.exec，避免不同封装对多语句支持不一致）
        state.storage.sql.exec(INDEX_SCHEMA_SQL);

        try {
            const cols = this.storage.sql`PRAGMA table_info(mmdb_meta);`;
            const hasSourceUrl = Array.isArray(cols) && cols.some((c) => c?.name === 'source_url');
            const hasBuildEpoch = Array.isArray(cols) && cols.some((c) => c?.name === 'build_epoch');
            if (!hasSourceUrl) {
                this.storage.sql`ALTER TABLE mmdb_meta ADD COLUMN source_url TEXT;`;
            }
            if (!hasBuildEpoch) {
                this.storage.sql`ALTER TABLE mmdb_meta ADD COLUMN build_epoch INTEGER;`;
            }
        } catch (err) {
            logError('[IndexDO] failed to ensure mmdb_meta columns:', err?.message || err);
        }
    }

    async fetch(request) {
        // Durable Object 是独立 isolate，需要在 DO 内部也初始化 logger
        initLogger(this.env);

        const requestId = getRequestId(request);
        const url = new URL(request.url);
        debug(`[IndexDO] [${requestId}] ${request.method} ${url.pathname}`);

        try {
            return await handleIndexDoRequest({
                request,
                env: this.env,
                storage: this.storage,
                requestId,
            });
        } catch (err) {
            logError(`[IndexDO] [${requestId}] unhandled error:`, err?.message || err);
            return errorResponse('Internal Server Error', 500);
        }
    }
}
