/**
 * L3 - Molecule（Service）
 * 系统设置：读取/回填默认值/更新（带内存缓存）。
 */

import { defaultSettings } from '../../settings-defaults.js';
import { getSystemSettingsRow } from '../../atoms/settings/settingsAtoms.js';
import { upsertSystemSettings } from '../../atoms/settings/settingsAtoms.js';
import { debug } from '../../../utils/logger.js';
import { parseJsonObjectOrEmpty } from '../../../atoms/json/parseJsonObjectOrEmpty.js';
import { mergeSettingsWithDefaults } from '../../atoms/settings/settingsAtoms.js';

const SETTINGS_CACHE_TTL_MS = 30000;
let settingsCache = null;
let settingsCacheAt = 0;

/**
 * 获取系统设置
 * 如果数据库中没有某个 key，则从 defaultSettings 获取并自动保存
 * @param {object} ctx
 * @returns {Promise<object>}
 */
export async function getSystemSettings(ctx) {
    if (settingsCache && Date.now() - settingsCacheAt < SETTINGS_CACHE_TTL_MS) {
        debug('[Settings] cache hit');
        return settingsCache;
    }

    const result = getSystemSettingsRow(ctx);
    const dbSettings = parseJsonObjectOrEmpty(result?.settings);
    const { merged, needsSave } = mergeSettingsWithDefaults({ defaultSettings, dbSettings });

    // 如果有缺失的 key，自动保存到数据库
    if (needsSave) {
        await updateSystemSettings(ctx, merged);
    }

    settingsCache = merged;
    settingsCacheAt = Date.now();
    return merged;
}

/**
 * 获取单个设置项
 * @param {object} ctx
 * @param {string} key 
 * @returns {Promise<any>}
 */
export async function getSetting(ctx, key) {
    const settings = await getSystemSettings(ctx);
    return settings[key];
}

/**
 * 更新系统设置
 * @param {object} ctx
 * @param {object} settings 
 */
export async function updateSystemSettings(ctx, settings) {
    const json = JSON.stringify(settings);
    const now = Date.now();
    upsertSystemSettings(ctx, json, now);
    settingsCache = settings;
    settingsCacheAt = Date.now();
}
