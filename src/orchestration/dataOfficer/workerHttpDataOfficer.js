/**
 * L2 - Data Officer
 * 只负责解析/归一化 Worker HTTP 请求信息，不做业务决策、不做外部交互。
 */

export function parseWorkerHttpRoute(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
        return { kind: 'cors-preflight' };
    }

    if (pathname === '/health' || pathname === '/api/utils/worker-status') {
        return { kind: 'health' };
    }

    if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/dashboard')) {
        return { kind: 'not-found' };
    }

    // GeoIP MMDB files are internal assets.
    // Do NOT expose them through public routes to avoid being scraped.
    if (pathname === '/mmdb' || pathname.startsWith('/mmdb/')) {
        return { kind: 'blocked-mmdb' };
    }

    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments.length === 0) {
        return { kind: 'not-found' };
    }

    return {
        kind: 'user-path',
        user: {
            userPath: pathSegments[0],
        },
    };
}
