/**
 * 系统设置管理
 */

import { defaultSettings } from './settings-defaults.js';

/**
 * 获取系统设置
 * 如果数据库中没有某个 key，则从 defaultSettings 获取并自动保存
 * @param {D1Database} db 
 * @returns {Promise<object>}
 */
export async function getSystemSettings(db) {
    const result = await db.prepare('SELECT settings FROM system_settings WHERE id = 1').first();
    let dbSettings = {};

    try {
        dbSettings = JSON.parse(result?.settings || '{}');
    } catch (e) {
        dbSettings = {};
    }

    // 合并默认值，检查是否有缺失的 key
    let needsSave = false;
    const merged = { ...defaultSettings };

    for (const key of Object.keys(defaultSettings)) {
        if (key in dbSettings) {
            merged[key] = dbSettings[key];
        } else {
            // 缺失的 key，标记需要保存
            needsSave = true;
        }
    }

    // 保留数据库中存在但不在默认值中的 key
    for (const key of Object.keys(dbSettings)) {
        if (!(key in defaultSettings)) {
            merged[key] = dbSettings[key];
        }
    }

    // 如果有缺失的 key，自动保存到数据库
    if (needsSave) {
        await updateSystemSettings(db, merged);
    }

    return merged;
}

/**
 * 获取单个设置项
 * @param {D1Database} db 
 * @param {string} key 
 * @returns {Promise<any>}
 */
export async function getSetting(db, key) {
    const settings = await getSystemSettings(db);
    return settings[key];
}

/**
 * 更新系统设置
 * @param {D1Database} db 
 * @param {object} settings 
 */
export async function updateSystemSettings(db, settings) {
    const json = JSON.stringify(settings);
    const now = Date.now();
    await db.prepare(
        'INSERT OR REPLACE INTO system_settings (id, settings, updated_at) VALUES (1, ?, ?)'
    ).bind(json, now).run();
}
