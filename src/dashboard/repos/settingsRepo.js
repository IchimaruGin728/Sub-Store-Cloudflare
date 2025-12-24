export async function getSystemSettingsRow(db) {
    return await db.one('SELECT settings, updated_at FROM system_settings WHERE id = 1');
}

export async function upsertSystemSettings(db, settingsJson, now) {
    return await db.run(
        'INSERT OR REPLACE INTO system_settings (id, settings, updated_at) VALUES (1, ?, ?)',
        settingsJson,
        now
    );
}

