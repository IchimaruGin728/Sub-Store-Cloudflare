/**
 * L3 - Molecule
 * Dashboard 用户 API（需要认证）
 * - 用户信息
 * - 密码/用户名修改
 * - 路径重新生成
 * - 用户设置
 * - 下载访问日志
 */

import { jsonResponse, errorResponse, okResponse } from '../atoms/http/httpAtoms.js';
import { hashPassword } from '../atoms/crypto/password.js';
import { getSystemSettings } from './services/systemSettingsService.js';
import { getUserById, getUser, updateUserData, updatePassword, updateUsername, updatePath, generatePath } from './services/userService.js';
import { getRequestId } from '../../utils/logger.js';
import { getAccessLogFromUserDo } from '../../atoms/cf/bindings.js';
import { normalizeUserDataToObject } from '../atoms/user/normalizeUserDataToObject.js';

export async function handleDashboardUserApi({ request, env, authPayload }) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ctx = env.DB;

    // GET /api/dashboard/user/me
    if (path === '/api/dashboard/user/me' && method === 'GET') {
        const user = await getUserById(ctx, authPayload.id);
        const avatarUrl = user?.avatar_url || user?.avatarUrl || '';
        return jsonResponse({ ...user, avatarUrl, avatar_url: undefined });
    }

    // GET /api/dashboard/user/access-log?limit=50&beforeId=123
    if (path === '/api/dashboard/user/access-log' && method === 'GET') {
        const requestId = getRequestId(request);
        const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
        const beforeId = parseInt(url.searchParams.get('beforeId') || '0', 10) || 0;
        const body = await getAccessLogFromUserDo({ env, userId: authPayload.id, limit, beforeId, requestId });
        return jsonResponse(body);
    }

    // POST /api/dashboard/user/me
    if (path === '/api/dashboard/user/me' && method === 'POST') {
        const newData = await request.json();
        await updateUserData(ctx, authPayload.id, newData);
        return okResponse();
    }

    // POST /api/dashboard/user/password
    if (path === '/api/dashboard/user/password' && method === 'POST') {
        const { newPassword } = await request.json();
        const settings = await getSystemSettings(ctx);
        const passwordMinLength = parseInt(settings?.passwordMinLength ?? 8, 10) || 8;
        if (!newPassword || newPassword.length < passwordMinLength) {
            return errorResponse(`密码长度至少为${passwordMinLength}位`, 400);
        }
        const hashedPassword = await hashPassword(newPassword);
        await updatePassword(ctx, authPayload.id, hashedPassword);
        return okResponse();
    }

    // POST /api/dashboard/user/username
    if (path === '/api/dashboard/user/username' && method === 'POST') {
        const { newUsername } = await request.json();
        if (!newUsername || newUsername.length < 3) {
            return errorResponse('用户名长度过短', 400);
        }
        const existing = await getUser(ctx, newUsername);
        if (existing) {
            return errorResponse('用户名已存在');
        }
        await updateUsername(ctx, authPayload.id, newUsername);
        return okResponse();
    }

    // POST /api/dashboard/user/regenerate-path
    if (path === '/api/dashboard/user/regenerate-path' && method === 'POST') {
        const newPath = generatePath();
        await updatePath(ctx, authPayload.id, newPath);
        return okResponse({ path: newPath });
    }

    // GET /api/dashboard/user/settings
    if (path === '/api/dashboard/user/settings' && method === 'GET') {
        const user = await getUserById(ctx, authPayload.id);
        const userData = normalizeUserDataToObject(user?.data);
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
        const user = await getUserById(ctx, authPayload.id);
        const userData = normalizeUserDataToObject(user?.data);
        userData.__settings__ = newSettings;
        await updateUserData(ctx, authPayload.id, userData);
        return okResponse();
    }

    return errorResponse('Not Found', 404);
}
