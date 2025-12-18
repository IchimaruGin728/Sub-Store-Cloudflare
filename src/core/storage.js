/**
 * 用户存储管理
 * 处理用户数据的读写和持久化
 */

import { debug, info } from '../utils/logger.js';

/**
 * 创建用户专属的存储实例
 * 使用用户的 data 字段作为存储
 */
export function createUserStorage(user) {
    // 解析用户的 data JSON
    let userData = {};
    try {
        userData = JSON.parse(user.data || '{}');
    } catch (e) {
        userData = {};
    }

    // 创建用户专属的 persistentStore
    return {
        read: (key) => {
            const value = userData[key];
            return value !== undefined ? value : null;
        },
        write: (data, key) => {
            userData[key] = data;
            // 标记需要保存
            globalThis.__user_data_dirty__ = true;
            globalThis.__user_data__ = userData;

            // 检测备份恢复：当写入 'sub-store' 时（OpenAPI 会去掉 # 前缀），需要重新初始化
            if (key === 'sub-store') {
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
        await db.prepare('UPDATE users SET data = ?, updated_at = ? WHERE id = ?')
            .bind(data, Date.now(), userId).run();
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
