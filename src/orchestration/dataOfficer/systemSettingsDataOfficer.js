/**
 * L2 - Data Officer
 * 系统设置的 merge/patch 规则（不做 IO）。
 */

import { defaultSettings } from '../../dashboard/settings-defaults.js';

export function mergeSystemSettings({ dbSettings }) {
    const db = dbSettings && typeof dbSettings === 'object' ? dbSettings : {};

    let needsSave = false;
    const merged = { ...defaultSettings };

    // 默认值覆盖（缺失 key 需要补齐并保存）
    for (const key of Object.keys(defaultSettings)) {
        if (key in db) {
            merged[key] = db[key];
        } else {
            needsSave = true;
        }
    }

    // 保留 DB 中多出来的 key（向前兼容）
    for (const key of Object.keys(db)) {
        if (!(key in defaultSettings)) {
            merged[key] = db[key];
        }
    }

    return { merged, needsSave };
}

export function mergeSystemSettingsPatch({ current, patch }) {
    const c = current && typeof current === 'object' ? current : {};
    const p = patch && typeof patch === 'object' ? patch : {};
    return { ...c, ...p };
}

