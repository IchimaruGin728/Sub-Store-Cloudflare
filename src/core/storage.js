/**
 * 用户存储管理
 * 处理用户数据的读写和持久化
 */

import { debug, info } from '../utils/logger.js';

/**
 * 创建用户专属的存储实例
 * 使用用户的 data 字段作为存储
 * 
 * Surge $persistentStore API:
 * - read([key]) 返回 string 或 null
 * - write(data<String>, [key]) 返回 bool，仅支持 string
 */
export function createUserStorage(user) {
    // 默认存储键（当不传入 key 时使用）
    const DEFAULT_KEY = '__default__';

    // 解析用户的 data JSON
    let userData = {};
    try {
        userData = JSON.parse(user.data || '{}');
    } catch (e) {
        userData = {};
    }

    // 创建用户专属的 persistentStore
    return {
        /**
         * 读取数据
         * @param {string} [key] - 存储键，不传时使用默认键
         * @returns {string|null} - 返回字符串或 null
         */
        read: (key) => {
            const storageKey = key || DEFAULT_KEY;
            const value = userData[storageKey];
            // 确保返回 string 或 null
            if (value === undefined || value === null) {
                return null;
            }
            // 如果存储的是对象，转换为 JSON 字符串（兼容旧数据）
            if (typeof value === 'object') {
                return JSON.stringify(value);
            }
            return String(value);
        },

        /**
         * 写入数据
         * @param {string} data - 要存储的数据（必须是字符串）
         * @param {string} [key] - 存储键，不传时使用默认键
         * @returns {boolean} - 是否成功
         */
        write: (data, key) => {
            const storageKey = key || DEFAULT_KEY;
            // 存储原始字符串（不做 JSON 解析，因为调用方负责序列化）
            userData[storageKey] = data;

            // 标记需要保存
            globalThis.__user_data_dirty__ = true;
            globalThis.__user_data__ = userData;

            // 检测备份恢复：当写入 'sub-store' 时，需要重新初始化
            if (storageKey === 'sub-store') {
                debug('[Workers] 检测到备份恢复，标记需要重新初始化');
                globalThis.__need_reinit__ = true;
            }

            return true;
        },

        // 获取当前数据（用于保存）
        getData: () => userData,
    };
}

/**
 * 保存用户数据到数据库
 */
export async function saveUserData(db, userId) {
    if (globalThis.__user_data_dirty__ && globalThis.__user_data__) {
        const data = JSON.stringify(globalThis.__user_data__);
        if (typeof db?.run === 'function') {
            await db.run('UPDATE users SET data = ?, updated_at = ? WHERE id = ?', data, Date.now(), userId);
        } else {
            await db.prepare('UPDATE users SET data = ?, updated_at = ? WHERE id = ?')
                .bind(data, Date.now(), userId).run();
        }
        globalThis.__user_data_dirty__ = false;
        info(`[Workers] 用户数据已保存: userId=${userId}`);
    }
}

/**
 * 重置用户数据标记
 */
export function resetUserDataFlags() {
    globalThis.__user_data_dirty__ = false;
    globalThis.__user_data__ = null;
}
