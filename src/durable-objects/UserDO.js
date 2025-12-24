import { DurableObject } from 'cloudflare:workers';
import { setupGlobals } from '../core/globals.js';
import { handleSubStoreHttpRequest, handleSubStoreCronRequest } from '../core/substore.js';

const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);
`;

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function extractAvatarUrl(userDataObj) {
    try {
        const subStoreStr = userDataObj?.['sub-store'];
        if (!subStoreStr) return '';
        const subStoreData = JSON.parse(subStoreStr);
        return subStoreData?.settings?.avatarUrl || '';
    } catch {
        return '';
    }
}

export class UserDO extends DurableObject {
    constructor(state, env) {
        super(state, env);
        this.state = state;
        this.env = env;
        this.sql = state.storage.sql;
        this.sql.exec(USER_SCHEMA_SQL);
    }

    #loadUserDataString() {
        const cursor = this.sql.exec('SELECT value FROM user_store WHERE key = ?;', 'user_data');
        const result = cursor.next();
        if (result.done) return '{}';
        return result.value?.value ?? '{}';
    }

    #saveUserDataString(userDataString) {
        this.sql.exec(
            'INSERT OR REPLACE INTO user_store (key, value, updated_at) VALUES (?, ?, ?);',
            'user_data',
            userDataString,
            Date.now()
        );
    }

    async #updateAvatarUrlIfNeeded(userId, userDataString) {
        let userDataObj = null;
        try {
            userDataObj = JSON.parse(userDataString || '{}');
        } catch {
            return;
        }
        const avatarUrl = extractAvatarUrl(userDataObj);
        const stub = this.env.INDEX_DO.get(this.env.INDEX_DO.idFromName('index'));
        await stub.fetch('https://index/_internal/index/users/avatar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, avatarUrl }),
        });
    }

    async #saveDirtyUserData(userId) {
        if (globalThis.__user_data_dirty__ && globalThis.__user_data__) {
            const dataString = JSON.stringify(globalThis.__user_data__);
            this.#saveUserDataString(dataString);
            globalThis.__user_data_dirty__ = false;
            await this.#updateAvatarUrlIfNeeded(userId, dataString);
        }
    }

    async fetch(request) {
        const url = new URL(request.url);
        const path = url.pathname;

        const headerUserId = request.headers.get('X-User-Id');
        const userId = parseInt(headerUserId || '0', 10) || 0;

        if (path === '/_internal/user-data' && request.method === 'GET') {
            return jsonResponse({ data: this.#loadUserDataString() });
        }

        if (path === '/_internal/user-data' && request.method === 'PUT') {
            const body = await request.json();
            const dataString = JSON.stringify(body?.data ?? {});
            this.#saveUserDataString(dataString);
            if (userId) {
                await this.#updateAvatarUrlIfNeeded(userId, dataString);
            }
            return jsonResponse({ ok: true });
        }

        if (path === '/_internal/user-data' && request.method === 'DELETE') {
            this.sql.exec('DELETE FROM user_store WHERE key = ?;', 'user_data');
            if (userId) {
                await this.#updateAvatarUrlIfNeeded(userId, '{}');
            }
            return jsonResponse({ ok: true });
        }

        if (path === '/_internal/cron' && request.method === 'POST') {
            const username = request.headers.get('X-Username') || `user-${userId || 'unknown'}`;
            const role = request.headers.get('X-Role') || 'user';
            const userPath = request.headers.get('X-User-Path') || '';
            const userData = this.#loadUserDataString();
            const user = { id: userId, username, role, path: userPath, data: userData };

            const env = {
                ...this.env,
                __saveUserData: (id) => this.#saveDirtyUserData(id),
            };
            setupGlobals(env);
            await handleSubStoreCronRequest({ user, env });
            return jsonResponse({ ok: true });
        }

        // Sub-Store HTTP requests for this user.
        const username = request.headers.get('X-Username') || `user-${userId || 'unknown'}`;
        const role = request.headers.get('X-Role') || 'user';
        const userPath = request.headers.get('X-User-Path') || '';
        const userData = this.#loadUserDataString();
        const user = { id: userId, username, role, path: userPath, data: userData };

        const ctx = { waitUntil: (p) => this.state.waitUntil(p) };
        const env = {
            ...this.env,
            __saveUserData: (id) => this.#saveDirtyUserData(id),
        };
        setupGlobals(env);
        const subStorePath = url.pathname + url.search;
        return handleSubStoreHttpRequest({ user, env, ctx, request, subStorePath });
    }
}
