export async function deleteExpiredCaptchas(db, now) {
    return await db.run('DELETE FROM captchas WHERE expires_at < ?', now);
}

export async function insertCaptcha(db, id, code, expiresAt) {
    return await db.run(
        'INSERT INTO captchas (id, code, attempts, expires_at) VALUES (?, ?, 0, ?)',
        id,
        code,
        expiresAt
    );
}

export async function getCaptchaForVerify(db, id) {
    return await db.one('SELECT code, attempts, expires_at FROM captchas WHERE id = ?', id);
}

export async function deleteCaptcha(db, id) {
    return await db.run('DELETE FROM captchas WHERE id = ?', id);
}

export async function incrementCaptchaAttempts(db, id) {
    return await db.run('UPDATE captchas SET attempts = attempts + 1 WHERE id = ?', id);
}

