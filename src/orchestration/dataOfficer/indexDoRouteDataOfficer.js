/**
 * L2 - Data Officer
 * 只负责解析 IndexDO 内部路由，不做业务逻辑与 IO。
 */

const INDEX_ENDPOINTS = {
    SETTINGS: '/_internal/index/settings',
    USER_BY_PATH: '/_internal/index/user/by-path',
    USERS_LIST: '/_internal/index/users/list',
    USERS_AVATAR: '/_internal/index/users/avatar',
    USER_DATA: '/_internal/index/user-data',
    MMDB_META: '/_internal/index/mmdb/meta',
    MMDB_FILE: '/_internal/index/mmdb/file',
};

export function parseIndexDoRoute(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === INDEX_ENDPOINTS.SETTINGS && method === 'GET') return { kind: 'settings-get' };
    if (path === INDEX_ENDPOINTS.SETTINGS && method === 'POST') return { kind: 'settings-patch' };

    if (path === INDEX_ENDPOINTS.USER_BY_PATH && method === 'GET') {
        const userPath = url.searchParams.get('path') || '';
        return { kind: 'user-by-path', userPath };
    }

    if (path === INDEX_ENDPOINTS.USERS_LIST && method === 'GET') {
        const afterId = parseInt(url.searchParams.get('afterId') || '0', 10) || 0;
        const limit = parseInt(url.searchParams.get('limit') || '200', 10) || 200;
        return { kind: 'users-list', afterId, limit };
    }

    if (path === INDEX_ENDPOINTS.USERS_AVATAR && method === 'POST') return { kind: 'users-avatar' };

    if (path === INDEX_ENDPOINTS.USER_DATA && (method === 'GET' || method === 'PUT' || method === 'DELETE')) {
        const userId = parseInt(url.searchParams.get('userId') || '0', 10) || 0;
        return { kind: 'user-data', userId, method };
    }

    if (path === INDEX_ENDPOINTS.MMDB_META && method === 'GET') {
        return { kind: 'mmdb-meta' };
    }

    if (path === INDEX_ENDPOINTS.MMDB_FILE && method === 'GET') {
        const name = url.searchParams.get('name') || '';
        return { kind: 'mmdb-file-get', name };
    }

    if (path === INDEX_ENDPOINTS.MMDB_FILE && method === 'PUT') {
        const name = url.searchParams.get('name') || '';
        return { kind: 'mmdb-file-put', name };
    }

    if (path.startsWith('/api/dashboard')) return { kind: 'dashboard-api' };

    return { kind: 'not-found' };
}
