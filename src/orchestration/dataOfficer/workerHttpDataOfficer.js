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

    if (pathname.startsWith('/dashboard') || pathname.startsWith('/api/dashboard')) {
        const isApi = pathname.startsWith('/api/dashboard');
        const isAssets = pathname.startsWith('/dashboard/assets/');
        return {
            kind: 'dashboard',
            dashboard: {
                isApi,
                isAssets,
                pathname,
            },
        };
    }

    // Block internal mmdb assets under dashboard assets as well.
    if (pathname.startsWith('/dashboard/assets/mmdb/')) {
        return { kind: 'blocked-mmdb' };
    }

    // GeoIP MMDB files are internal assets (used by the runtime via env.ASSETS.fetch).
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
