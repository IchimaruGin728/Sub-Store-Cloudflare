const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS user_store (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS download_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  target TEXT,
  status INTEGER,
  path TEXT,
  ua TEXT,
  ip TEXT
);
`;

export function ensureUserDoSchema(stateStorageSql, storage) {
    stateStorageSql.exec(USER_SCHEMA_SQL);

    try {
        const cols = storage.sql`PRAGMA table_info(download_access_log);`;
        const hasStatus = Array.isArray(cols) && cols.some((c) => c?.name === 'status');
        if (!hasStatus) {
            storage.sql`ALTER TABLE download_access_log ADD COLUMN status INTEGER;`;
        }
    } catch {}
}

export function selectUserStoreValue(storage, key) {
    const row = storage.sql`
        SELECT value
        FROM user_store
        WHERE key = ${key};
    `[0];
    return row?.value ?? null;
}

export function upsertUserStoreValue(storage, key, value, now) {
    storage.sql`
        INSERT OR REPLACE INTO user_store (key, value, updated_at)
        VALUES (${key}, ${value}, ${now});
    `;
    return { success: true };
}

export function deleteUserStoreKey(storage, key) {
    storage.sql`DELETE FROM user_store WHERE key = ${key};`;
    return { success: true };
}

export function selectAccessLogPage(storage, { limit, beforeId }) {
    if (beforeId > 0) {
        return storage.sql`
            SELECT id, ts, kind, name, target, status, path, ua, ip
            FROM download_access_log
            WHERE id < ${beforeId}
            ORDER BY id DESC
            LIMIT ${limit};
        `;
    }

    return storage.sql`
        SELECT id, ts, kind, name, target, status, path, ua, ip
        FROM download_access_log
        ORDER BY id DESC
        LIMIT ${limit};
    `;
}

export function appendAccessLogWithRetention(storage, { ts, kind, name, target, status, path, ua, ip }) {
    storage.sql`
        INSERT INTO download_access_log (ts, kind, name, target, status, path, ua, ip)
        VALUES (${ts}, ${kind}, ${name}, ${target ?? null}, ${status ?? null}, ${path ?? null}, ${ua ?? null}, ${ip ?? null});
    `;

    const MAX_ROWS = 5000;
    const maxId = storage.sql`SELECT MAX(id) AS maxId FROM download_access_log;`[0]?.maxId ?? 0;
    const cutoffId = maxId - MAX_ROWS;
    if (cutoffId > 0) {
        storage.sql`DELETE FROM download_access_log WHERE id <= ${cutoffId};`;
    }
}
