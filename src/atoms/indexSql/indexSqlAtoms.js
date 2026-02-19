import { debug } from '../../utils/logger.js';

export function selectMmdbFileByName(storage, name) {
    const meta =
        storage.sql`
            SELECT name, etag, updated_at AS updatedAt, total_size AS totalSize, chunk_size AS chunkSize, chunks
            FROM mmdb_meta
            WHERE name = ${name};
        `[0] ?? null;

    if (!meta) return null;

    const rows = storage.sql`
        SELECT idx, data
        FROM mmdb_chunks
        WHERE name = ${name}
        ORDER BY idx ASC;
    `;

    const chunks = Array.isArray(rows) ? rows : [];
    if (chunks.length === 0) return null;

    const totalSize = Number(meta.totalSize || 0);
    if (!Number.isFinite(totalSize) || totalSize <= 0) return null;

    const out = new Uint8Array(totalSize);
    let offset = 0;
    for (const c of chunks) {
        const buf = c?.data;
        if (!buf) return null;
        const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        out.set(u8, offset);
        offset += u8.byteLength;
    }

    if (offset !== totalSize) return null;

    return {
        name: meta.name,
        etag: meta.etag,
        updatedAt: meta.updatedAt,
        data: out,
    };
}

export function selectMmdbFilesMeta(storage) {
    return storage.sql`
        SELECT
            name,
            etag,
            updated_at AS updatedAt,
            source_url AS sourceUrl,
            build_epoch AS buildEpoch,
            total_size AS size
        FROM mmdb_meta
        ORDER BY name ASC;
    `;
}

export function upsertMmdbFile(storage, {
    name,
    etag,
    updatedAt,
    data,
    chunkSize = 256 * 1024,
    sourceUrl = '',
    buildEpoch = null,
}) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const totalSize = bytes.byteLength;
    const cs = Math.max(8 * 1024, Math.min(Number(chunkSize) || 64 * 1024, 256 * 1024));
    const chunks = Math.ceil(totalSize / cs);

    debug(`[MMDB] upsert start: name=${name} size=${totalSize} chunkSize=${cs} chunks=${chunks}`);

    storage.sql`DELETE FROM mmdb_chunks WHERE name = ${name};`;
    storage.sql`DELETE FROM mmdb_meta WHERE name = ${name};`;

    storage.sql`
        INSERT OR REPLACE INTO mmdb_meta (name, etag, updated_at, source_url, build_epoch, total_size, chunk_size, chunks)
        VALUES (${name}, ${etag || ''}, ${updatedAt}, ${sourceUrl || ''}, ${buildEpoch}, ${totalSize}, ${cs}, ${chunks});
    `;

    for (let i = 0; i < chunks; i += 1) {
        const start = i * cs;
        const end = Math.min(totalSize, start + cs);
        const slice = bytes.subarray(start, end);
        storage.sql`
            INSERT OR REPLACE INTO mmdb_chunks (name, idx, data)
            VALUES (${name}, ${i}, ${slice});
        `;
    }

    debug(`[MMDB] upsert success: name=${name} size=${totalSize} chunks=${chunks}`);

    return { success: true, totalSize, chunkSize: cs, chunks };
}

export function selectSystemSettingsRow(storage) {
    return (
        storage.sql`
            SELECT settings, updated_at
            FROM system_settings
            WHERE id = 1;
        `[0] ?? null
    );
}

export function upsertSystemSettingsRow(storage, settingsJson, now) {
    storage.sql`
        INSERT OR REPLACE INTO system_settings (id, settings, updated_at)
        VALUES (1, ${settingsJson}, ${now});
    `;
    return { success: true };
}

export function selectUserByPath(storage, userPath) {
    return (
        storage.sql`
            SELECT id, username, role, path
            FROM users
            WHERE path = ${userPath};
        `[0] ?? null
    );
}

export function selectUsersAfterId(storage, afterId, limit) {
    return storage.sql`
        SELECT id, username, role, path
        FROM users
        WHERE id > ${afterId}
        ORDER BY id
        LIMIT ${limit};
    `;
}

export function updateAvatarUrl(storage, userId, avatarUrl, now) {
    storage.sql`
        UPDATE users
        SET avatar_url = ${avatarUrl}, updated_at = ${now}
        WHERE id = ${userId};
    `;
    return { success: true };
}
