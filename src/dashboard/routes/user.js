/**
 * 用户路由 - 需要认证
 * - 用户信息
 * - 密码/用户名修改
 * - 路径重新生成
 * - 用户设置
 */
import { jsonResponse, errorResponse, okResponse } from '../utils/response.js';
import { hashPassword } from '../password.js';
import { getSystemSettings } from '../settings.js';
import { getUserById, getUser, updateUserData, updatePassword, updateUsername, updatePath, generatePath } from '../user.js';

/**
 * 处理用户路由
 * @param {Request} request
 * @param {object} env
 * @param {object} authPayload - 认证后的用户信息
 * @returns {Response|null}
 */
export async function handleUserRoutes(request, env, authPayload) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const db = env.DB;

    // 只处理 /api/dashboard/user 路径
    if (!path.startsWith('/api/dashboard/user')) {
        return null;
    }

    // GET /api/dashboard/user/me
    if (path === '/api/dashboard/user/me' && method === 'GET') {
        const user = await getUserById(db, authPayload.id);
        const avatarUrl = user?.avatar_url || user?.avatarUrl || '';
        return jsonResponse({ ...user, avatarUrl, avatar_url: undefined });
    }

    // POST /api/dashboard/user/me
    if (path === '/api/dashboard/user/me' && method === 'POST') {
        const newData = await request.json();
        await updateUserData(db, authPayload.id, newData);
        return okResponse();
    }

    // POST /api/dashboard/user/password
    if (path === '/api/dashboard/user/password' && method === 'POST') {
        const { newPassword } = await request.json();
        const settings = await getSystemSettings(db);
        const passwordMinLength = parseInt(settings?.passwordMinLength ?? 8, 10) || 8;
        if (!newPassword || newPassword.length < passwordMinLength) {
            return errorResponse(`密码长度至少为${passwordMinLength}位`, 400);
        }
        const hashedPassword = await hashPassword(newPassword);
        await updatePassword(db, authPayload.id, hashedPassword);
        return okResponse();
    }

    // POST /api/dashboard/user/username
    if (path === '/api/dashboard/user/username' && method === 'POST') {
        const { newUsername } = await request.json();
        if (!newUsername || newUsername.length < 3) {
            return errorResponse('用户名长度过短', 400);
        }
        const existing = await getUser(db, newUsername);
        if (existing) {
            return errorResponse('用户名已存在');
        }
        await updateUsername(db, authPayload.id, newUsername);
        return okResponse();
    }

    // POST /api/dashboard/user/regenerate-path
    if (path === '/api/dashboard/user/regenerate-path' && method === 'POST') {
        const newPath = generatePath();
        await updatePath(db, authPayload.id, newPath);
        return okResponse({ path: newPath });
    }

    // GET /api/dashboard/user/settings
    if (path === '/api/dashboard/user/settings' && method === 'GET') {
        const user = await getUserById(db, authPayload.id);
        let userData = {};
        try {
            userData = JSON.parse(user.data || '{}');
        } catch (e) {
            userData = {};
        }
        const settings = userData.__settings__ || {
            surgeVersion: '5.0.0',
            surgeBuild: '2000',
            cronEnabled: true,
            notification: { type: 'none', bark: { serverUrl: 'https://api.day.app', deviceKey: '', group: 'SubStore' }, pushover: { userKey: '', appToken: '' } }
        };
        return jsonResponse(settings);
    }

    // POST /api/dashboard/user/settings
    if (path === '/api/dashboard/user/settings' && method === 'POST') {
        const newSettings = await request.json();
        const user = await getUserById(db, authPayload.id);
        let userData = {};
        try {
            userData = JSON.parse(user.data || '{}');
        } catch (e) {
            userData = {};
        }
        userData.__settings__ = newSettings;
        await updateUserData(db, authPayload.id, userData);
        return okResponse();
    }

    return null;
}
