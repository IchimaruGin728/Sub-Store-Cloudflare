import { signToken, authenticateRequest } from './auth.js';
import { getUser, getUserByPath, getUserById, createUser, updateUserData, updateUsername, updatePath, listUsers, deleteUser, updatePassword, updateNotes, generatePath } from './user.js';
import { createCaptcha, verifyCaptcha } from './captcha.js';
import { getSystemSettings, updateSystemSettings, getSetting } from './settings.js';

// ===== Response Helpers =====

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function errorResponse(message, status = 400) {
    return new Response(JSON.stringify({ error: message }), { status, headers: corsHeaders });
}

function okResponse(data = {}) {
    return jsonResponse({ status: 'ok', ...data });
}

// ===== Route Parsing Helper =====

function parseAdminUserRoute(path) {
    // /api/dashboard/admin/user/:id/:action?
    const prefix = '/api/dashboard/admin/user/';
    if (!path.startsWith(prefix)) return null;

    const rest = path.slice(prefix.length);
    const segments = rest.split('/').filter(Boolean);

    if (segments.length === 0) return null;

    const id = parseInt(segments[0], 10);
    if (isNaN(id)) return null;

    return {
        userId: id,
        action: segments[1] || null  // 'password', 'username', 'path', 'notes', 'regenerate-path', or null
    };
}

/**
 * Handle Dashboard API Requests
 * @param {Request} request 
 * @param {object} env 
 * @returns {Promise<Response|null>} Response if handled, null if not
 */
export async function handleDashboardRequest(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- Static Assets (via Cloudflare Static Assets) ---
    if (path === '/dashboard' || path === '/dashboard/') {
        const assetUrl = new URL('/dashboard/index.html', request.url);
        return env.ASSETS.fetch(new Request(assetUrl, request));
    }
    if (path.startsWith('/dashboard/assets/')) {
        return env.ASSETS.fetch(request);
    }

    // Check if it's a dashboard request
    if (!path.startsWith('/api/dashboard')) {
        return null;
    }

    const method = request.method;
    const db = env.DB;

    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // ===== Public Routes =====

        // GET /api/dashboard/captcha
        if (path === '/api/dashboard/captcha' && method === 'GET') {
            const captcha = await createCaptcha(db);
            return jsonResponse(captcha);
        }

        // GET /api/dashboard/settings/public - 公开设置
        if (path === '/api/dashboard/settings/public' && method === 'GET') {
            const frontendUrl = await getSetting(db, 'frontendUrl');
            return jsonResponse({ frontendUrl });
        }

        // POST /api/dashboard/auth/login
        if (path === '/api/dashboard/auth/login' && method === 'POST') {
            const { username, password, captchaId, captchaCode } = await request.json();
            const valid = await verifyCaptcha(db, captchaId, captchaCode);
            if (!valid) {
                return errorResponse('验证码错误或已过期');
            }

            let user = await getUser(db, username);

            // First time init: if no users, create admin
            if (!user && username === 'admin') {
                const allUsers = await listUsers(db);
                if (allUsers.results.length === 0) {
                    await createUser(db, 'admin', 'admin', 'admin');
                    user = await getUser(db, 'admin');
                }
            }

            if (!user || user.password_hash !== password) {
                return errorResponse('用户名或密码错误', 401);
            }

            const token = await signToken({ id: user.id, username: user.username, role: user.role });
            const frontendUrl = await getSetting(db, 'frontendUrl');
            return jsonResponse({ token, role: user.role, path: user.path, frontendUrl });
        }

        // ===== Protected Routes =====

        const authPayload = await authenticateRequest(request);
        if (!authPayload) {
            return errorResponse('Unauthorized', 401);
        }

        // GET /api/dashboard/user/me
        if (path === '/api/dashboard/user/me' && method === 'GET') {
            const user = await getUserById(db, authPayload.id);
            // 从 data['sub-store'].settings.avatarUrl 提取头像
            let avatarUrl = '';
            try {
                const userData = JSON.parse(user.data || '{}');
                const subStoreData = JSON.parse(userData['sub-store'] || '{}');
                avatarUrl = subStoreData.settings?.avatarUrl || '';
            } catch (e) { }
            return jsonResponse({ ...user, avatarUrl });
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
            await updatePassword(db, authPayload.id, newPassword);
            return okResponse();
        }

        // POST /api/dashboard/user/username
        if (path === '/api/dashboard/user/username' && method === 'POST') {
            const { newUsername } = await request.json();
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

        // ===== Admin Routes =====

        if (path.startsWith('/api/dashboard/admin')) {
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
                if (await getUser(db, username)) {
                    return errorResponse('User exists');
                }
                await createUser(db, username, password, role || 'user');
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
                    await updatePassword(db, userId, newPassword);
                    return okResponse();
                }

                // POST /api/dashboard/admin/user/:id/username
                if (action === 'username' && method === 'POST') {
                    const { newUsername } = await request.json();
                    const existing = await getUser(db, newUsername);
                    if (existing) {
                        return errorResponse('Username already exists');
                    }
                    await updateUsername(db, userId, newUsername);
                    return okResponse();
                }

                // POST /api/dashboard/admin/user/:id/path (手动设置路径)
                if (action === 'path' && method === 'POST') {
                    const { newPath } = await request.json();
                    const existing = await getUserByPath(db, newPath);
                    if (existing) {
                        return errorResponse('Path already exists');
                    }
                    await updatePath(db, userId, newPath);
                    return okResponse();
                }

                // POST /api/dashboard/admin/user/:id/regenerate-path (后端生成路径)
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
        }

        return errorResponse('Not Found', 404);

    } catch (err) {
        console.error('Dashboard Error:', err);
        return errorResponse(err.message, 500);
    }
}
