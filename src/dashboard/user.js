/**
 * User Model & Database Operations (Multi-Tenant)
 */

/**
 * 生成随机路径 (16位大小写字母+数字)
 * @returns {string}
 */
export function generatePath() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => chars[b % chars.length]).join('');
}

/**
 * 获取用户信息 (by username)
 * @param {D1Database} db 
 * @param {string} username 
 */
export async function getUser(db, username) {
    return await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
}

/**
 * 获取用户信息 (by id)
 * @param {D1Database} db 
 * @param {number} id 
 */
export async function getUserById(db, id) {
    return await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
}

/**
 * 获取用户信息 (by path)
 * @param {D1Database} db 
 * @param {string} path 
 */
export async function getUserByPath(db, path) {
    return await db.prepare('SELECT * FROM users WHERE path = ?').bind(path).first();
}

/**
 * 创建用户 (自动生成 path)
 * @param {D1Database} db 
 * @param {string} username 
 * @param {string} passwordHash 
 * @param {string} role 
 */
export async function createUser(db, username, passwordHash, role = 'user') {
    const path = generatePath();
    return await db.prepare(
        'INSERT INTO users (username, password_hash, role, path) VALUES (?, ?, ?, ?)'
    ).bind(username, passwordHash, role, path).run();
}

/**
 * 更新用户数据 (by id)
 * @param {D1Database} db 
 * @param {number} id 
 * @param {object} data JSON object
 */
export async function updateUserData(db, id, data) {
    return await db.prepare(
        'UPDATE users SET data = ?, updated_at = ? WHERE id = ?'
    ).bind(JSON.stringify(data), Date.now(), id).run();
}

/**
 * 更新用户名 (by id, admin only)
 * @param {D1Database} db 
 * @param {number} id 
 * @param {string} newUsername 
 */
export async function updateUsername(db, id, newUsername) {
    return await db.prepare(
        'UPDATE users SET username = ?, updated_at = ? WHERE id = ?'
    ).bind(newUsername, Date.now(), id).run();
}

/**
 * 更新路径 (by id, admin only)
 * @param {D1Database} db 
 * @param {number} id 
 * @param {string} newPath 
 */
export async function updatePath(db, id, newPath) {
    return await db.prepare(
        'UPDATE users SET path = ?, updated_at = ? WHERE id = ?'
    ).bind(newPath, Date.now(), id).run();
}

/**
 * 列出所有用户 (包含 notes 和 avatarUrl 字段供管理员查看)
 * @param {D1Database} db 
 */
export async function listUsers(db) {
    const result = await db.prepare('SELECT id, username, role, path, notes, data, created_at, updated_at FROM users').all();
    // 从 data['sub-store'].settings.avatarUrl 提取头像
    const users = result.results.map(user => {
        let avatarUrl = '';
        try {
            const userData = JSON.parse(user.data || '{}');
            const subStoreData = JSON.parse(userData['sub-store'] || '{}');
            avatarUrl = subStoreData.settings?.avatarUrl || '';
        } catch (e) { }
        return {
            ...user,
            avatarUrl,
            data: undefined // 不返回完整 data 给列表
        };
    });
    return { results: users };
}

/**
 * 删除用户 (by id)
 * @param {D1Database} db 
 * @param {number} id 
 */
export async function deleteUser(db, id) {
    return await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
}

/**
 * 更新用户备注 (by id, admin only)
 * @param {D1Database} db 
 * @param {number} id 
 * @param {string} notes 
 */
export async function updateNotes(db, id, notes) {
    return await db.prepare(
        'UPDATE users SET notes = ?, updated_at = ? WHERE id = ?'
    ).bind(notes, Date.now(), id).run();
}

/**
 * 更新用户密码 (by id)
 * 同时递增 token_version，使所有旧 Token 失效
 * @param {D1Database} db 
 * @param {number} id 
 * @param {string} passwordHash 
 */
export async function updatePassword(db, id, passwordHash) {
    return await db.prepare(
        'UPDATE users SET password_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?'
    ).bind(passwordHash, Date.now(), id).run();
}
