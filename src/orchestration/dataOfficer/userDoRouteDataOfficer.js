/**
 * L2 - Data Officer
 * 只负责解析 UserDO 内部路由，不做业务逻辑与 IO。
 */

const USER_ENDPOINTS = {
    USER_DATA: '/_internal/user-data',
    CRON: '/_internal/cron',
    ACCESS_LOG: '/_internal/access-log',
};

function parseDownloadPath(pathname) {
    if (!pathname || typeof pathname !== 'string') return null;
    if (!pathname.startsWith('/download/')) return null;

    // /download/collection/:name(/:target)? ...
    if (pathname.startsWith('/download/collection/')) {
        const rest = pathname.slice('/download/collection/'.length);
        const segments = rest.split('/').filter(Boolean);
        const name = segments[0];
        if (!name) return null;
        const target = segments[1] && !segments[1].startsWith('api') ? segments[1] : null;
        return { kind: 'col', name, target };
    }

    // /download/:name(/:target)? ...
    const rest = pathname.slice('/download/'.length);
    const segments = rest.split('/').filter(Boolean);
    const name = segments[0];
    if (!name) return null;
    const target = segments[1] && !segments[1].startsWith('api') ? segments[1] : null;
    return { kind: 'sub', name, target };
}

function mergeTargets(pathTarget, queryTarget) {
    const t1 = (pathTarget || '').trim();
    const t2 = (queryTarget || '').trim();
    if (t2) {
        if (t1 && t1 !== t2) return `${t2} | ${t1}`;
        return t2;
    }
    return t1 || null;
}

export function parseUserDoRoute(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === USER_ENDPOINTS.ACCESS_LOG && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '50', 10) || 50;
        const beforeId = parseInt(url.searchParams.get('beforeId') || '0', 10) || 0;
        return { kind: 'access-log', limit, beforeId };
    }

    if (path === USER_ENDPOINTS.USER_DATA && method === 'GET') return { kind: 'user-data-get' };
    if (path === USER_ENDPOINTS.USER_DATA && method === 'PUT') return { kind: 'user-data-put' };
    if (path === USER_ENDPOINTS.USER_DATA && method === 'DELETE') return { kind: 'user-data-delete' };

    if (path === USER_ENDPOINTS.CRON && method === 'POST') return { kind: 'cron' };

    // Sub-Store 请求（默认）
    const downloadMeta = method === 'GET' ? parseDownloadPath(path) : null;
    const downloadLogCandidate = downloadMeta
        ? {
            ts: Date.now(),
            kind: downloadMeta.kind,
            name: downloadMeta.name,
            target: mergeTargets(downloadMeta.target, url.searchParams.get('target') || ''),
            path: `${path}${url.search || ''}`,
            ua: request.headers.get('User-Agent') || request.headers.get('user-agent') || '',
            ip: request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '',
        }
        : null;

    return {
        kind: 'substore',
        substore: {
            subStorePath: url.pathname + url.search,
        },
        downloadLogCandidate,
    };
}
