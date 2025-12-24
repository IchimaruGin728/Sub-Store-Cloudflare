export async function getUserByUsername(db, username) {
    return await db.one('SELECT * FROM users WHERE username = ?', username);
}

export async function getUserById(db, id) {
    return await db.one('SELECT * FROM users WHERE id = ?', id);
}

export async function getUserByPath(db, path) {
    return await db.one('SELECT * FROM users WHERE path = ?', path);
}

export async function countUsers(db) {
    const row = await db.one('SELECT COUNT(*) as count FROM users');
    return row?.count ?? 0;
}

export async function createUser(db, username, passwordHash, role, path) {
    return await db.run(
        'INSERT INTO users (username, password_hash, role, path) VALUES (?, ?, ?, ?)',
        username,
        passwordHash,
        role,
        path
    );
}

export async function updateUserDataInUsersTable(db, id, dataJson, now) {
    return await db.run('UPDATE users SET data = ?, updated_at = ? WHERE id = ?', dataJson, now, id);
}

export async function updateUsername(db, id, newUsername, now) {
    return await db.run('UPDATE users SET username = ?, updated_at = ? WHERE id = ?', newUsername, now, id);
}

export async function updatePath(db, id, newPath, now) {
    return await db.run('UPDATE users SET path = ?, updated_at = ? WHERE id = ?', newPath, now, id);
}

export async function updateNotes(db, id, notes, now) {
    return await db.run('UPDATE users SET notes = ?, updated_at = ? WHERE id = ?', notes, now, id);
}

export async function updatePasswordAndBumpTokenVersion(db, id, passwordHash, now) {
    return await db.run(
        'UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?',
        passwordHash,
        now,
        id
    );
}

export async function deleteUser(db, id) {
    return await db.run('DELETE FROM users WHERE id = ?', id);
}

export async function listUsersForAdmin(db) {
    return await db.all('SELECT id, username, role, path, notes, avatar_url, created_at, updated_at FROM users');
}

