import { setRequestIdHeader } from '../../utils/logger.js';

const INDEX_ORIGIN = 'https://index';
const USER_ORIGIN = 'https://user';

const INDEX_ENDPOINTS = {
    USER_BY_PATH: '/_internal/index/user/by-path',
    USERS_LIST: '/_internal/index/users/list',
    SETTINGS: '/_internal/index/settings',
    USERS_AVATAR: '/_internal/index/users/avatar',
    MMDB_META: '/_internal/index/mmdb/meta',
    MMDB_FILE: '/_internal/index/mmdb/file',
};

const USER_ENDPOINTS = {
    CRON: '/_internal/cron',
    USER_DATA: '/_internal/user-data',
    ACCESS_LOG: '/_internal/access-log',
};

function setUserHeaders(headers, user) {
    if (!headers) return;
    if (user?.id !== undefined && user?.id !== null) headers.set('X-User-Id', String(user.id));
    if (user?.username) headers.set('X-Username', user.username);
    if (user?.role) headers.set('X-Role', user.role);
    if (user?.path) headers.set('X-User-Path', user.path);
}

function stripFirstPathSegment(pathname) {
    const segments = String(pathname || '').split('/').filter(Boolean);
    return '/' + segments.slice(1).join('/');
}

export async function fetchIndexDo({ request, env, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const forwarded = new Request(request);
    setRequestIdHeader(forwarded.headers, requestId);
    return await stub.fetch(forwarded);
}

export async function getUserByPathFromIndexDo({ env, userPath, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.USER_BY_PATH, INDEX_ORIGIN);
    url.searchParams.set('path', String(userPath || ''));
    const headers = new Headers();
    setRequestIdHeader(headers, requestId);
    const resp = await stub.fetch(url.toString(), { method: 'GET', headers });
    if (!resp.ok) return null;
    return await resp.json();
}

export async function listUsersFromIndexDo({ env, afterId, limit, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.USERS_LIST, INDEX_ORIGIN);
    url.searchParams.set('afterId', String(afterId || 0));
    url.searchParams.set('limit', String(limit || 200));
    const headers = new Headers();
    setRequestIdHeader(headers, requestId);
    const resp = await stub.fetch(url.toString(), { method: 'GET', headers });
    if (!resp.ok) return { results: [] };
    return await resp.json();
}

export async function getSettingsFromIndexDo({ env, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.SETTINGS, INDEX_ORIGIN).toString();
    const headers = new Headers();
    setRequestIdHeader(headers, requestId);
    const resp = await stub.fetch(url, { method: 'GET', headers });
    if (!resp.ok) return {};
    return await resp.json();
}

export async function patchSettingsToIndexDo({ env, patch, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.SETTINGS, INDEX_ORIGIN).toString();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    setRequestIdHeader(headers, requestId);
    const resp = await stub.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(patch || {}),
    });
    return resp.ok;
}

export async function updateAvatarInIndexDo({ env, userId, avatarUrl, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.USERS_AVATAR, INDEX_ORIGIN).toString();
    const headers = new Headers({ 'Content-Type': 'application/json' });
    setRequestIdHeader(headers, requestId);
    const resp = await stub.fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId, avatarUrl }),
    });
    return resp.ok;
}

export async function getMmdbMetaFromIndexDo({ env, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.MMDB_META, INDEX_ORIGIN).toString();
    const req = new Request(url, { method: 'GET' });
    if (requestId) setRequestIdHeader(req.headers, requestId);
    const resp = await stub.fetch(req);
    if (!resp.ok) return { files: [] };
    return await resp.json();
}

export async function getMmdbFileFromIndexDo({ env, name, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.MMDB_FILE, INDEX_ORIGIN);
    url.searchParams.set('name', name);
    const req = new Request(url.toString(), { method: 'GET' });
    if (requestId) setRequestIdHeader(req.headers, requestId);
    const resp = await stub.fetch(req);
    if (!resp.ok) {
        return {
            ok: false,
            status: resp.status,
            etag: resp.headers.get('etag') || '',
            updatedAt: resp.headers.get('x-mmdb-updated-at') || '',
            arrayBuffer: null,
        };
    }
    const ab = await resp.arrayBuffer();
    return {
        ok: true,
        status: resp.status,
        arrayBuffer: ab,
        etag: resp.headers.get('etag') || '',
        updatedAt: resp.headers.get('x-mmdb-updated-at') || '',
    };
}

export async function putMmdbFileToIndexDo({ env, name, etag, arrayBuffer, requestId }) {
    const id = env.INDEX_DO.idFromName('index');
    const stub = env.INDEX_DO.get(id);
    const url = new URL(INDEX_ENDPOINTS.MMDB_FILE, INDEX_ORIGIN);
    url.searchParams.set('name', name);
    const headers = new Headers();
    if (etag) headers.set('X-MMDB-ETAG', etag);
    if (requestId) setRequestIdHeader(headers, requestId);
    const req = new Request(url.toString(), {
        method: 'PUT',
        headers,
        body: arrayBuffer,
    });
    const resp = await stub.fetch(req);
    return resp.ok;
}

export async function forwardRequestToUserDoSubStore({ request, env, user, requestId }) {
    const originalUrl = new URL(request.url);
    const newUrl = new URL(request.url);
    newUrl.pathname = stripFirstPathSegment(originalUrl.pathname);
    newUrl.search = originalUrl.search;
    const forwarded = new Request(newUrl.toString(), request);
    setUserHeaders(forwarded.headers, user);
    setRequestIdHeader(forwarded.headers, requestId);
    const id = env.USER_DO.idFromName(String(user.id));
    const stub = env.USER_DO.get(id);
    return await stub.fetch(forwarded);
}

export async function triggerUserCron({ env, user, requestId }) {
    const id = env.USER_DO.idFromName(String(user?.id));
    const stub = env.USER_DO.get(id);
    const headers = new Headers();
    setUserHeaders(headers, user);
    setRequestIdHeader(headers, requestId);
    const url = new URL(USER_ENDPOINTS.CRON, USER_ORIGIN).toString();
    const resp = await stub.fetch(url, { method: 'POST', headers });
    return resp.ok;
}

export async function getUserDataFromUserDo({ env, userId, requestId }) {
    const id = env.USER_DO.idFromName(String(userId));
    const stub = env.USER_DO.get(id);
    const headers = new Headers({ 'X-User-Id': String(userId) });
    setRequestIdHeader(headers, requestId);
    const url = new URL(USER_ENDPOINTS.USER_DATA, USER_ORIGIN).toString();
    const resp = await stub.fetch(url, { method: 'GET', headers });
    if (!resp.ok) return null;
    const body = await resp.json();
    return body?.data ?? null;
}

export async function putUserDataToUserDo({ env, userId, data, requestId }) {
    const id = env.USER_DO.idFromName(String(userId));
    const stub = env.USER_DO.get(id);
    const headers = new Headers({ 'Content-Type': 'application/json', 'X-User-Id': String(userId) });
    setRequestIdHeader(headers, requestId);
    const url = new URL(USER_ENDPOINTS.USER_DATA, USER_ORIGIN).toString();
    const resp = await stub.fetch(url, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ data }),
    });
    return resp.ok;
}

export async function deleteUserDataFromUserDo({ env, userId, requestId }) {
    const id = env.USER_DO.idFromName(String(userId));
    const stub = env.USER_DO.get(id);
    const headers = new Headers({ 'X-User-Id': String(userId) });
    setRequestIdHeader(headers, requestId);
    const url = new URL(USER_ENDPOINTS.USER_DATA, USER_ORIGIN).toString();
    const resp = await stub.fetch(url, { method: 'DELETE', headers });
    return resp.ok;
}

export async function getAccessLogFromUserDo({ env, userId, limit, beforeId, requestId }) {
    const id = env.USER_DO.idFromName(String(userId));
    const stub = env.USER_DO.get(id);
    const url = new URL(USER_ENDPOINTS.ACCESS_LOG, USER_ORIGIN);
    url.searchParams.set('limit', String(limit || 50));
    if (beforeId) url.searchParams.set('beforeId', String(beforeId));
    const headers = new Headers({ 'X-User-Id': String(userId) });
    setRequestIdHeader(headers, requestId);
    const resp = await stub.fetch(url.toString(), { method: 'GET', headers });
    if (!resp.ok) return { results: [], nextBeforeId: null };
    try {
        return await resp.json();
    } catch {
        return { results: [], nextBeforeId: null };
    }
}

export async function fetchAsset({ requestOrUrl, env }) {
    return await env.ASSETS.fetch(requestOrUrl);
}
