/**
 * L3 - Molecule（Service）
 * 用户：读取/写入 users 表 + 通过 userDataStore 读写 UserDO data（带内存缓存）。
 */

import { getUserByUsername as getUserByUsernameSql } from '../../atoms/userSql/userSqlAtoms.js';
import { getUserById as getUserByIdSql } from '../../atoms/userSql/userSqlAtoms.js';
import { getUserByPath as getUserByPathSql } from '../../atoms/userSql/userSqlAtoms.js';
import { createUser as createUserSql } from '../../atoms/userSql/userSqlAtoms.js';
import { updateUsername as updateUsernameSql } from '../../atoms/userSql/userSqlAtoms.js';
import { updatePath as updatePathSql } from '../../atoms/userSql/userSqlAtoms.js';
import { updateNotes as updateNotesSql } from '../../atoms/userSql/userSqlAtoms.js';
import { updatePasswordAndBumpTokenVersion as updatePasswordAndBumpTokenVersionSql } from '../../atoms/userSql/userSqlAtoms.js';
import { deleteUser as deleteUserSql } from '../../atoms/userSql/userSqlAtoms.js';
import { listUsersForAdmin as listUsersForAdminSql } from '../../atoms/userSql/userSqlAtoms.js';
import { debug } from '../../../utils/logger.js';

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
 * @param {object} ctx
 * @param {string} username 
 */
export async function getUser(ctx, username) {
    const cached = getCached(userCacheByUsername, username);
    if (cached) {
        debug('[User] cache hit: username', username);
        return cached;
    }
    const user = getUserByUsernameSql(ctx, username);
    if (user) {
        if (ctx.userDataStore && user.id) {
            const data = await ctx.userDataStore.get(user.id);
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
 * @param {object} ctx
 * @param {number} id 
 */
export async function getUserById(ctx, id) {
    const cached = getCached(userCacheById, id);
    if (cached) {
        debug('[User] cache hit: id', id);
        return cached;
    }
    const user = getUserByIdSql(ctx, id);
    if (user) {
        if (ctx.userDataStore && user.id) {
            const data = await ctx.userDataStore.get(user.id);
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
 * @param {object} ctx
 * @param {string} path 
 */
export async function getUserByPath(ctx, path) {
    const cached = getCached(userCacheByPath, path);
    if (cached) {
        debug('[User] cache hit: path', path);
        return cached;
    }
    const user = getUserByPathSql(ctx, path);
    if (user) {
        if (ctx.userDataStore && user.id) {
            const data = await ctx.userDataStore.get(user.id);
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
 * @param {object} ctx
 * @param {string} username 
 * @param {string} passwordHash 
 * @param {string} role 
 */
export async function createUser(ctx, username, passwordHash, role = 'user') {
    const path = generatePath();
    const result = createUserSql(ctx, username, passwordHash, role, path);
    clearUserCache();
    return result;
}

/**
 * 更新用户数据 (by id)
 * @param {object} ctx
 * @param {number} id 
 * @param {object} data JSON object
 */
export async function updateUserData(ctx, id, data) {
    if (ctx.userDataStore) {
        const ok = await ctx.userDataStore.put(id, data);
        clearUserCache();
        return { success: !!ok };
    }
    throw new Error('userDataStore 未配置，无法写入用户 data');
}

/**
 * 更新用户名 (by id, admin only)
 * @param {object} ctx
 * @param {number} id 
 * @param {string} newUsername 
 */
export async function updateUsername(ctx, id, newUsername) {
    const now = Date.now();
    const result = updateUsernameSql(ctx, id, newUsername, now);
    clearUserCache();
    return result;
}

/**
 * 更新路径 (by id, admin only)
 * @param {object} ctx
 * @param {number} id 
 * @param {string} newPath 
 */
export async function updatePath(ctx, id, newPath) {
    const now = Date.now();
    const result = updatePathSql(ctx, id, newPath, now);
    clearUserCache();
    return result;
}

/**
 * 列出所有用户 (包含 notes 和 avatarUrl 字段供管理员查看)
 * @param {object} ctx
 */
export async function listUsers(ctx) {
    const results = listUsersForAdminSql(ctx);
    const users = results.map(user => ({
        ...user,
        avatarUrl: user.avatar_url || '',
        avatar_url: undefined,
    }));
    return { results: users };
}

/**
 * 删除用户 (by id)
 * @param {object} ctx
 * @param {number} id 
 */
export async function deleteUser(ctx, id) {
    if (ctx.userDataStore) {
        await ctx.userDataStore.delete(id);
    }
    const result = deleteUserSql(ctx, id);
    clearUserCache();
    return result;
}

/**
 * 更新用户备注 (by id, admin only)
 * @param {object} ctx
 * @param {number} id 
 * @param {string} notes 
 */
export async function updateNotes(ctx, id, notes) {
    const now = Date.now();
    const result = updateNotesSql(ctx, id, notes, now);
    clearUserCache();
    return result;
}

/**
 * 更新用户密码 (by id)
 * 同时递增 token_version，使所有旧 Token 失效
 * @param {object} ctx
 * @param {number} id 
 * @param {string} passwordHash 
 */
export async function updatePassword(ctx, id, passwordHash) {
    const now = Date.now();
    const result = updatePasswordAndBumpTokenVersionSql(ctx, id, passwordHash, now);
    clearUserCache();
    return result;
}
