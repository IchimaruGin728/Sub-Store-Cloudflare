export function getSystemSettingsRow(ctx) {
    return ctx.storage.sql`
        SELECT settings, updated_at
        FROM system_settings
        WHERE id = 1;
    `[0] ?? null;
}

export function upsertSystemSettings(ctx, settingsJson, now) {
    ctx.storage.sql`
        INSERT OR REPLACE INTO system_settings (id, settings, updated_at)
        VALUES (1, ${settingsJson}, ${now});
    `;
    return { success: true };
}

export function mergeSettingsWithDefaults({ defaultSettings, dbSettings }) {
    let needsSave = false;
    const merged = { ...defaultSettings };

    for (const key of Object.keys(defaultSettings)) {
        if (key in dbSettings) {
            merged[key] = dbSettings[key];
        } else {
            needsSave = true;
        }
    }

    for (const key of Object.keys(dbSettings)) {
        if (!(key in defaultSettings)) {
            merged[key] = dbSettings[key];
        }
    }

    return { merged, needsSave };
}
