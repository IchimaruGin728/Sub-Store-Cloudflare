import { DurableObject } from 'cloudflare:workers';
import { handleDashboardRequest } from '../dashboard/router.js';
import { createSqliteDb } from '../dashboard/db.js';
import { getSystemSettings, updateSystemSettings } from '../dashboard/settings.js';

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
`;

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function errorResponse(message, status = 400) {
    return jsonResponse({ error: message }, status);
}

export class IndexDO extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.state = state;
        this.env = env;
        this.sql = state.storage.sql;
        this.sql.exec(INDEX_SCHEMA_SQL);
    }

    #userStub(userId) {
        const id = this.env.USER_DO.idFromName(String(userId));
        return this.env.USER_DO.get(id);
    }

    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path.startsWith('/_internal/index/settings') && request.method === 'GET') {
            const db = createSqliteDb(this.sql);
            const settings = await getSystemSettings(db);
            return jsonResponse(settings);
        }

        if (path.startsWith('/_internal/index/settings') && request.method === 'POST') {
            const patch = await request.json();
            const db = createSqliteDb(this.sql);
            const current = await getSystemSettings(db);
            const next = { ...current, ...patch };
            await updateSystemSettings(db, next);
            return jsonResponse({ ok: true });
        }

        if (path.startsWith('/_internal/index/user/by-path') && request.method === 'GET') {
            const userPath = url.searchParams.get('path') || '';
            if (!userPath) return errorResponse('path required', 400);
            const cursor = this.sql.exec('SELECT id, username, role, path FROM users WHERE path = ?;', userPath);
            const result = cursor.next();
            if (result.done) return errorResponse('Not Found', 404);
            return jsonResponse(result.value);
        }

        if (path.startsWith('/_internal/index/users/list') && request.method === 'GET') {
            const afterId = parseInt(url.searchParams.get('afterId') || '0', 10) || 0;
            const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get('limit') || '200', 10) || 200));
            const results = this.sql.exec(
                'SELECT id, username, role, path FROM users WHERE id > ? ORDER BY id LIMIT ?;',
                afterId,
                limit
            ).toArray();
            return jsonResponse({ results });
        }

        if (path.startsWith('/_internal/index/users/avatar') && request.method === 'POST') {
            const body = await request.json();
            const userId = parseInt(body?.userId, 10);
            const avatarUrl = String(body?.avatarUrl || '');
            if (!userId) return errorResponse('userId required', 400);
            this.sql.exec('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?;', avatarUrl, Date.now(), userId);
            return jsonResponse({ ok: true });
        }

        // Used by admin/user endpoints to fetch user data from UserDO.
        if (path.startsWith('/_internal/index/user-data') && request.method === 'GET') {
            const userId = parseInt(url.searchParams.get('userId') || '0', 10) || 0;
            if (!userId) return errorResponse('userId required', 400);
            const stub = this.#userStub(userId);
            const resp = await stub.fetch('https://user/_internal/user-data', { method: 'GET' });
            return resp;
        }

        if (path.startsWith('/_internal/index/user-data') && request.method === 'PUT') {
            const userId = parseInt(url.searchParams.get('userId') || '0', 10) || 0;
            if (!userId) return errorResponse('userId required', 400);
            const stub = this.#userStub(userId);
            const resp = await stub.fetch('https://user/_internal/user-data', request);
            return resp;
        }

        if (path.startsWith('/api/dashboard')) {
            const userDataStore = {
                get: async (userId) => {
                    const stub = this.#userStub(userId);
                    const resp = await stub.fetch('https://user/_internal/user-data', { method: 'GET' });
                    if (!resp.ok) return null;
                    const body = await resp.json();
                    return body?.data ?? null;
                },
                put: async (userId, data) => {
                    const stub = this.#userStub(userId);
                    const resp = await stub.fetch('https://user/_internal/user-data', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'X-User-Id': String(userId) },
                        body: JSON.stringify({ data }),
                    });
                    return resp.ok;
                },
                delete: async (userId) => {
                    const stub = this.#userStub(userId);
                    const resp = await stub.fetch('https://user/_internal/user-data', {
                        method: 'DELETE',
                        headers: { 'X-User-Id': String(userId) },
                    });
                    return resp.ok;
                },
            };

            const db = createSqliteDb(this.sql, { userDataStore });
            return handleDashboardRequest(request, { ...this.env, DB: db });
        }

        return new Response('Not Found', { status: 404 });
    }
}
