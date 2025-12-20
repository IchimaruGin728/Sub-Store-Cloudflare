/**
 * 管理员路由 - 需要认证且角色为 admin
 * - 用户管理
 * - 系统设置
 */
import { jsonResponse, errorResponse, okResponse } from '../utils/response.js';
import { hashPassword } from '../password.js';
import {
    getUser, getUserById, getUserByPath, listUsers, createUser, deleteUser,
    updateUserData, updatePassword, updateUsername, updatePath, updateNotes, generatePath
} from '../user.js';
import { getSystemSettings, updateSystemSettings } from '../settings.js';

/**
 * 解析 /api/dashboard/admin/user/:id/:action? 路由
 */
function parseAdminUserRoute(path) {
    const prefix = '/api/dashboard/admin/user/';
    if (!path.startsWith(prefix)) return null;

    const rest = path.slice(prefix.length);
    const segments = rest.split('/').filter(Boolean);

    if (segments.length === 0) return null;

    const id = parseInt(segments[0], 10);
    if (isNaN(id)) return null;

    return {
        userId: id,
        action: segments[1] || null
    };
}

/**
 * 处理管理员路由
 * @param {Request} request
 * @param {object} env
 * @param {object} authPayload - 认证后的用户信息
 * @returns {Response|null}
 */
export async function handleAdminRoutes(request, env, authPayload) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const db = env.DB;

    // 只处理 /api/dashboard/admin 路径
    if (!path.startsWith('/api/dashboard/admin')) {
        return null;
    }

    // 权限检查
    if (authPayload.role !== 'admin') {
        return errorResponse('Forbidden', 403);
    }

    // GET /api/dashboard/admin/users
    if (path === '/api/dashboard/admin/users' && method === 'GET') {
        const users = await listUsers(db);
        return jsonResponse(users.results);
    }

    // POST /api/dashboard/admin/user/create
    if (path === '/api/dashboard/admin/user/create' && method === 'POST') {
        const { username, password, role } = await request.json();
        const settings = await getSystemSettings(db);
        const passwordMinLength = parseInt(settings?.passwordMinLength ?? 8, 10) || 8;
        if (!username || !password) {
            return errorResponse('用户名和密码不能为空', 400);
        }
        if (username.length < 3) {
            return errorResponse('用户名长度过短', 400);
        }
        if (password.length < passwordMinLength) {
            return errorResponse(`密码长度至少为${passwordMinLength}位`, 400);
        }
        if (await getUser(db, username)) {
            return errorResponse('用户已存在');
        }
        const hashedPassword = await hashPassword(password);
        const nextRole = role === 'admin' ? 'admin' : 'user';
        await createUser(db, username, hashedPassword, nextRole);
        const newUser = await getUser(db, username);
        return jsonResponse({ status: 'created', path: newUser.path });
    }

    // GET /api/dashboard/admin/settings
    if (path === '/api/dashboard/admin/settings' && method === 'GET') {
        const settings = await getSystemSettings(db);
        return jsonResponse(settings);
    }

    // POST /api/dashboard/admin/settings
    if (path === '/api/dashboard/admin/settings' && method === 'POST') {
        const newSettings = await request.json();
        await updateSystemSettings(db, newSettings);
        const cacheKey = new Request(new URL('/api/dashboard/settings/public', request.url).toString(), {
            method: 'GET'
        });
        await caches.default.delete(cacheKey);
        return okResponse();
    }

    // /api/dashboard/admin/user/:id/:action?
    const route = parseAdminUserRoute(path);
    if (route) {
        const { userId, action } = route;

        // GET /api/dashboard/admin/user/:id
        if (action === null && method === 'GET') {
            const user = await getUserById(db, userId);
            return jsonResponse(user);
        }

        // POST /api/dashboard/admin/user/:id
        if (action === null && method === 'POST') {
            const newData = await request.json();
            await updateUserData(db, userId, newData);
            return okResponse();
        }

        // DELETE /api/dashboard/admin/user/:id
        if (action === null && method === 'DELETE') {
            const user = await getUserById(db, userId);
            if (user && user.role === 'admin') {
                return errorResponse('Cannot delete admin', 403);
            }
            await deleteUser(db, userId);
            return jsonResponse({ status: 'deleted' });
        }

        // POST /api/dashboard/admin/user/:id/password
        if (action === 'password' && method === 'POST') {
            const { newPassword } = await request.json();
            const settings = await getSystemSettings(db);
            const passwordMinLength = parseInt(settings?.passwordMinLength ?? 8, 10) || 8;
            if (!newPassword || newPassword.length < passwordMinLength) {
                return errorResponse(`密码长度至少为${passwordMinLength}位`, 400);
            }
            const hashedPassword = await hashPassword(newPassword);
            await updatePassword(db, userId, hashedPassword);
            return okResponse();
        }

        // POST /api/dashboard/admin/user/:id/username
        if (action === 'username' && method === 'POST') {
            const { newUsername } = await request.json();
            if (!newUsername || newUsername.length < 3) {
                return errorResponse('用户名长度过短', 400);
            }
            const existing = await getUser(db, newUsername);
            if (existing) {
                return errorResponse('用户名已存在');
            }
            await updateUsername(db, userId, newUsername);
            return okResponse();
        }

        // POST /api/dashboard/admin/user/:id/path
        if (action === 'path' && method === 'POST') {
            const { newPath } = await request.json();
            const existing = await getUserByPath(db, newPath);
            if (existing) {
            return errorResponse('路径已存在');
            }
            await updatePath(db, userId, newPath);
            return okResponse();
        }

        // POST /api/dashboard/admin/user/:id/regenerate-path
        if (action === 'regenerate-path' && method === 'POST') {
            const newPath = generatePath();
            await updatePath(db, userId, newPath);
            return okResponse({ path: newPath });
        }

        // POST /api/dashboard/admin/user/:id/notes
        if (action === 'notes' && method === 'POST') {
            const { notes } = await request.json();
            await updateNotes(db, userId, notes || '');
            return okResponse();
        }
    }

    return null;
}
