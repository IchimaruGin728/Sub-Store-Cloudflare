export function getUserByUsername(ctx, username) {
    return ctx.storage.sql`SELECT * FROM users WHERE username = ${username};`[0] ?? null;
}

export function getUserById(ctx, id) {
    return ctx.storage.sql`SELECT * FROM users WHERE id = ${id};`[0] ?? null;
}

export function getUserByPath(ctx, path) {
    return ctx.storage.sql`SELECT * FROM users WHERE path = ${path};`[0] ?? null;
}

export function createUser(ctx, username, passwordHash, role, path) {
    ctx.storage.sql`
        INSERT INTO users (username, password_hash, role, path)
        VALUES (${username}, ${passwordHash}, ${role}, ${path});
    `;
    return { success: true };
}

export function updateUsername(ctx, id, newUsername, now) {
    ctx.storage.sql`
        UPDATE users
        SET username = ${newUsername}, updated_at = ${now}
        WHERE id = ${id};
    `;
    return { success: true };
}

export function updatePath(ctx, id, newPath, now) {
    ctx.storage.sql`
        UPDATE users
        SET path = ${newPath}, updated_at = ${now}
        WHERE id = ${id};
    `;
    return { success: true };
}

export function updateNotes(ctx, id, notes, now) {
    ctx.storage.sql`
        UPDATE users
        SET notes = ${notes}, updated_at = ${now}
        WHERE id = ${id};
    `;
    return { success: true };
}

export function updatePasswordAndBumpTokenVersion(ctx, id, passwordHash, now) {
    ctx.storage.sql`
        UPDATE users
        SET password_hash = ${passwordHash},
            token_version = token_version + 1,
            updated_at = ${now}
        WHERE id = ${id};
    `;
    return { success: true };
}

export function deleteUser(ctx, id) {
    ctx.storage.sql`DELETE FROM users WHERE id = ${id};`;
    return { success: true };
}

export function listUsersForAdmin(ctx) {
    return ctx.storage.sql`
        SELECT id, username, role, path, notes, avatar_url, created_at, updated_at
        FROM users;
    `;
}

export function getUserTokenVersionById(ctx, id) {
    const row = ctx.storage.sql`
        SELECT token_version
        FROM users
        WHERE id = ${id};
    `[0] ?? null;
    if (!row) return null;
    return row.token_version ?? 0;
}

export function countUsers(ctx) {
    const row = ctx.storage.sql`SELECT COUNT(*) as count FROM users;`[0] ?? null;
    return row?.count ?? 0;
}
