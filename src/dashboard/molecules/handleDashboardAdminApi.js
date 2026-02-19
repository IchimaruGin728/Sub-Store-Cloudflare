/**
 * L3 - Molecule
 * Dashboard 管理员 API（需要认证且角色为 admin）
 * - 用户管理
 * - 系统设置
 * - 下载访问日志（以用户维度查询）
 */

import { jsonResponse, errorResponse, okResponse } from '../atoms/http/httpAtoms.js';
import { hashPassword } from '../atoms/crypto/password.js';
import {
    getUser, getUserById, getUserByPath, listUsers, createUser, deleteUser,
    updateUserData, updatePassword, updateUsername, updatePath, updateNotes, generatePath
} from './services/userService.js';
import { getSystemSettings, updateSystemSettings } from './services/systemSettingsService.js';
import { getRequestId, debug, warn } from '../../utils/logger.js';
import { getAccessLogFromUserDo } from '../../atoms/cf/bindings.js';
import { upsertMmdbFile } from '../../atoms/indexSql/indexSqlAtoms.js';
import { selectMmdbFilesMeta } from '../../atoms/indexSql/indexSqlAtoms.js';
import { extractMmdbBuildEpochFromArrayBuffer } from '../atoms/mmdb/extractMmdbBuildEpochFromArrayBuffer.js';

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

function normalizeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    let parsed;
    try {
        parsed = new URL(raw);
    } catch {
        return '';
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.toString();
}

export async function handleDashboardAdminApi({ request, env, authPayload, io }) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ctx = env.DB;
    const requestId = getRequestId(request);

    if (authPayload.role !== 'admin') {
        return errorResponse('Forbidden', 403);
    }

    // GET /api/dashboard/admin/users
    if (path === '/api/dashboard/admin/users' && method === 'GET') {
        const users = await listUsers(ctx);
        return jsonResponse(users.results);
    }

    // POST /api/dashboard/admin/user/create
    if (path === '/api/dashboard/admin/user/create' && method === 'POST') {
        const { username, password, role } = await request.json();
        const settings = await getSystemSettings(ctx);
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
        if (await getUser(ctx, username)) {
            return errorResponse('用户已存在');
        }
        const hashedPassword = await hashPassword(password);
        const nextRole = role === 'admin' ? 'admin' : 'user';
        await createUser(ctx, username, hashedPassword, nextRole);
        const newUser = await getUser(ctx, username);
        return jsonResponse({ status: 'created', path: newUser.path });
    }

    // GET /api/dashboard/admin/settings
    if (path === '/api/dashboard/admin/settings' && method === 'GET') {
        const settings = await getSystemSettings(ctx);
        return jsonResponse(settings);
    }

    // POST /api/dashboard/admin/settings
    if (path === '/api/dashboard/admin/settings' && method === 'POST') {
        const newSettings = await request.json();
        await updateSystemSettings(ctx, newSettings);
        await io.deletePublicSettingsCache({ request });
        return okResponse();
    }

    if (path === '/api/dashboard/admin/mmdb/meta' && method === 'GET') {
        const files = selectMmdbFilesMeta(ctx.storage) || [];
        return jsonResponse({ files });
    }

    if (path === '/api/dashboard/admin/mmdb/update' && method === 'POST') {
        debug(`[MMDB] [${requestId}] update request received`);
        let body = {};
        try {
            body = await request.json();
        } catch {
            body = {};
        }

        const settings = await getSystemSettings(ctx);

        const countryUrl = normalizeHttpUrl(
            body?.countryUrl || settings?.mmdbCountryUrl || env?.MMDB_COUNTRY_URL || ''
        );
        const asnUrl = normalizeHttpUrl(
            body?.asnUrl || settings?.mmdbAsnUrl || env?.MMDB_ASN_URL || ''
        );

        if (!countryUrl || !asnUrl) {
            warn(`[MMDB] [${requestId}] invalid source urls: country=${countryUrl || '-'} asn=${asnUrl || '-'}`);
            return errorResponse('请先配置有效的 MMDB 下载 URL（Country / ASN）', 400);
        }

        debug(`[MMDB] [${requestId}] source urls ready: country=${countryUrl} asn=${asnUrl}`);

        const nextSettings = {
            ...settings,
            mmdbCountryUrl: countryUrl,
            mmdbAsnUrl: asnUrl,
        };
        await updateSystemSettings(ctx, nextSettings);

        const sources = [
            { name: 'Country.mmdb', url: countryUrl },
            { name: 'Country-asn.mmdb', url: asnUrl },
        ];

        for (const source of sources) {
            debug(`[MMDB] [${requestId}] downloading ${source.name} ...`);
            const remote = await io.fetchMmdbFromUrl({ url: source.url, requestId });
            if (!remote?.ok || !remote?.arrayBuffer) {
                warn(`[MMDB] [${requestId}] download failed: ${source.name} status=${remote?.status || 0}`);
                return errorResponse(`下载失败: ${source.name} (status=${remote?.status || 0})`, 502);
            }

            const now = Date.now();
            const buildEpoch = extractMmdbBuildEpochFromArrayBuffer(remote.arrayBuffer);
            debug(
                `[MMDB] [${requestId}] parsed ${source.name}: bytes=${remote.arrayBuffer.byteLength} etag=${remote.etag || ''} buildEpoch=${buildEpoch || 'null'}`,
            );

            const upsertResult = upsertMmdbFile(ctx.storage, {
                name: source.name,
                etag: remote.etag || '',
                sourceUrl: source.url,
                buildEpoch,
                updatedAt: now,
                data: new Uint8Array(remote.arrayBuffer),
                chunkSize: 256 * 1024,
            });

            debug(
                `[MMDB] [${requestId}] upsert done: ${source.name} size=${upsertResult.totalSize} chunkSize=${upsertResult.chunkSize} chunks=${upsertResult.chunks}`,
            );
        }

        const files = selectMmdbFilesMeta(ctx.storage) || [];
        debug(`[MMDB] [${requestId}] update success, meta files=${files.length}`);
        return jsonResponse({ ok: true, files });
    }

    const route = parseAdminUserRoute(path);
    if (route) {
        const { userId, action } = route;

        // GET /api/dashboard/admin/user/:id
        if (action === null && method === 'GET') {
            const user = await getUserById(ctx, userId);
            return jsonResponse(user);
        }

        // GET /api/dashboard/admin/user/:id/access-log?limit=50&beforeId=123
        if (action === 'access-log' && method === 'GET') {
            const user = await getUserById(ctx, userId);
            if (!user) return errorResponse('Not Found', 404);
            const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get('limit') || '50', 10) || 50));
            const beforeId = parseInt(url.searchParams.get('beforeId') || '0', 10) || 0;
            const body = await getAccessLogFromUserDo({ env, userId, limit, beforeId, requestId });
            return jsonResponse(body);
        }

        // POST /api/dashboard/admin/user/:id
        if (action === null && method === 'POST') {
            const newData = await request.json();
            await updateUserData(ctx, userId, newData);
            return okResponse();
        }

        // DELETE /api/dashboard/admin/user/:id
        if (action === null && method === 'DELETE') {
            const user = await getUserById(ctx, userId);
            if (user && user.role === 'admin') {
                return errorResponse('Cannot delete admin', 403);
            }
            await deleteUser(ctx, userId);
            return jsonResponse({ status: 'deleted' });
        }

        // POST /api/dashboard/admin/user/:id/password
        if (action === 'password' && method === 'POST') {
            const { newPassword } = await request.json();
            const settings = await getSystemSettings(ctx);
            const passwordMinLength = parseInt(settings?.passwordMinLength ?? 8, 10) || 8;
            if (!newPassword || newPassword.length < passwordMinLength) {
                return errorResponse(`密码长度至少为${passwordMinLength}位`, 400);
            }
            const hashedPassword = await hashPassword(newPassword);
            await updatePassword(ctx, userId, hashedPassword);
            return okResponse();
        }

        // POST /api/dashboard/admin/user/:id/username
        if (action === 'username' && method === 'POST') {
            const { newUsername } = await request.json();
            if (!newUsername || newUsername.length < 3) {
                return errorResponse('用户名长度过短', 400);
            }
            const existing = await getUser(ctx, newUsername);
            if (existing) {
                return errorResponse('用户名已存在');
            }
            await updateUsername(ctx, userId, newUsername);
            return okResponse();
        }

        // POST /api/dashboard/admin/user/:id/path
        if (action === 'path' && method === 'POST') {
            const { newPath } = await request.json();
            const existing = await getUserByPath(ctx, newPath);
            if (existing) {
                return errorResponse('路径已存在');
            }
            await updatePath(ctx, userId, newPath);
            return okResponse();
        }

        // POST /api/dashboard/admin/user/:id/regenerate-path
        if (action === 'regenerate-path' && method === 'POST') {
            const newPath = generatePath();
            await updatePath(ctx, userId, newPath);
            return okResponse({ path: newPath });
        }

        // POST /api/dashboard/admin/user/:id/notes
        if (action === 'notes' && method === 'POST') {
            const { notes } = await request.json();
            await updateNotes(ctx, userId, notes || '');
            return okResponse();
        }
    }

    return errorResponse('Not Found', 404);
}
