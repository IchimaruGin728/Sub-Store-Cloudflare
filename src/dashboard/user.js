/**
 * User Model & Database Operations (Multi-Tenant)
 */

import * as userRepo from './repos/userRepo.js';

const USER_CACHE_TTL_MS = 10000;
const userCacheById = new Map();
const userCacheByPath = new Map();
const userCacheByUsername = new Map();

function getCached(cache, key) {
    const cached = cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.at > USER_CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return cached.value;
}

function setCached(cache, key, value) {
    if (!key) return;
    cache.set(key, { value, at: Date.now() });
}

function clearUserCache() {
    userCacheById.clear();
    userCacheByPath.clear();
    userCacheByUsername.clear();
}

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
 * @param {DB} db 
 * @param {string} username 
 */
export async function getUser(db, username) {
    const cached = getCached(userCacheByUsername, username);
    if (cached) return cached;
    const user = await userRepo.getUserByUsername(db, username);
    if (user) {
        if (db.userDataStore && user.id) {
            const data = await db.userDataStore.get(user.id);
            if (data !== null && data !== undefined) {
                user.data = data;
            }
        }
        setCached(userCacheByUsername, username, user);
        setCached(userCacheById, user.id, user);
        setCached(userCacheByPath, user.path, user);
    }
    return user;
}

/**
 * 获取用户信息 (by id)
 * @param {DB} db 
 * @param {number} id 
 */
export async function getUserById(db, id) {
    const cached = getCached(userCacheById, id);
    if (cached) return cached;
    const user = await userRepo.getUserById(db, id);
    if (user) {
        if (db.userDataStore && user.id) {
            const data = await db.userDataStore.get(user.id);
            if (data !== null && data !== undefined) {
                user.data = data;
            }
        }
        setCached(userCacheById, id, user);
        setCached(userCacheByUsername, user.username, user);
        setCached(userCacheByPath, user.path, user);
    }
    return user;
}

/**
 * 获取用户信息 (by path)
 * @param {DB} db 
 * @param {string} path 
 */
export async function getUserByPath(db, path) {
    const cached = getCached(userCacheByPath, path);
    if (cached) return cached;
    const user = await userRepo.getUserByPath(db, path);
    if (user) {
        if (db.userDataStore && user.id) {
            const data = await db.userDataStore.get(user.id);
            if (data !== null && data !== undefined) {
                user.data = data;
            }
        }
        setCached(userCacheByPath, path, user);
        setCached(userCacheById, user.id, user);
        setCached(userCacheByUsername, user.username, user);
    }
    return user;
}

/**
 * 创建用户 (自动生成 path)
 * @param {DB} db 
 * @param {string} username 
 * @param {string} passwordHash 
 * @param {string} role 
 */
export async function createUser(db, username, passwordHash, role = 'user') {
    const path = generatePath();
    const result = await userRepo.createUser(db, username, passwordHash, role, path);
    clearUserCache();
    return result;
}

/**
 * 更新用户数据 (by id)
 * @param {DB} db 
 * @param {number} id 
 * @param {object} data JSON object
 */
export async function updateUserData(db, id, data) {
    if (db.userDataStore) {
        const ok = await db.userDataStore.put(id, data);
        clearUserCache();
        return { success: !!ok };
    }
    const now = Date.now();
    const result = await userRepo.updateUserDataInUsersTable(db, id, JSON.stringify(data), now);
    clearUserCache();
    return result;
}

/**
 * 更新用户名 (by id, admin only)
 * @param {DB} db 
 * @param {number} id 
 * @param {string} newUsername 
 */
export async function updateUsername(db, id, newUsername) {
    const now = Date.now();
    const result = await userRepo.updateUsername(db, id, newUsername, now);
    clearUserCache();
    return result;
}

/**
 * 更新路径 (by id, admin only)
 * @param {DB} db 
 * @param {number} id 
 * @param {string} newPath 
 */
export async function updatePath(db, id, newPath) {
    const now = Date.now();
    const result = await userRepo.updatePath(db, id, newPath, now);
    clearUserCache();
    return result;
}

/**
 * 列出所有用户 (包含 notes 和 avatarUrl 字段供管理员查看)
 * @param {DB} db 
 */
export async function listUsers(db) {
    const results = await userRepo.listUsersForAdmin(db);
    const users = results.map(user => ({
        ...user,
        avatarUrl: user.avatar_url || '',
        avatar_url: undefined,
    }));
    return { results: users };
}

/**
 * 删除用户 (by id)
 * @param {DB} db 
 * @param {number} id 
 */
export async function deleteUser(db, id) {
    if (db.userDataStore) {
        await db.userDataStore.delete(id);
    }
    const result = await userRepo.deleteUser(db, id);
    clearUserCache();
    return result;
}

/**
 * 更新用户备注 (by id, admin only)
 * @param {DB} db 
 * @param {number} id 
 * @param {string} notes 
 */
export async function updateNotes(db, id, notes) {
    const now = Date.now();
    const result = await userRepo.updateNotes(db, id, notes, now);
    clearUserCache();
    return result;
}

/**
 * 更新用户密码 (by id)
 * 同时递增 token_version，使所有旧 Token 失效
 * @param {DB} db 
 * @param {number} id 
 * @param {string} passwordHash 
 */
export async function updatePassword(db, id, passwordHash) {
    const now = Date.now();
    const result = await userRepo.updatePasswordAndBumpTokenVersion(db, id, passwordHash, now);
    clearUserCache();
    return result;
}
