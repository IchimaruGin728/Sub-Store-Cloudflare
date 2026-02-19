export function deleteExpiredCaptchas(ctx, now) {
    ctx.storage.sql`DELETE FROM captchas WHERE expires_at < ${now};`;
    return { success: true };
}

export function insertCaptcha(ctx, id, code, expiresAt) {
    ctx.storage.sql`
        INSERT INTO captchas (id, code, attempts, expires_at)
        VALUES (${id}, ${code}, 0, ${expiresAt});
    `;
    return { success: true };
}

export function getCaptchaForVerify(ctx, id) {
    return ctx.storage.sql`
        SELECT code, attempts, expires_at
        FROM captchas
        WHERE id = ${id};
    `[0] ?? null;
}

export function deleteCaptcha(ctx, id) {
    ctx.storage.sql`DELETE FROM captchas WHERE id = ${id};`;
    return { success: true };
}

export function incrementCaptchaAttempts(ctx, id) {
    ctx.storage.sql`UPDATE captchas SET attempts = attempts + 1 WHERE id = ${id};`;
    return { success: true };
}
