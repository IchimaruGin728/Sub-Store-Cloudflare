/**
 * L2 - Data Officer
 * Dashboard 路由解析：只做解析与归类，不做业务逻辑与 IO。
 */

export function parseDashboardRoute(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path.startsWith('/dashboard/assets/')) {
        return { kind: 'assets', path };
    }

    if (path.startsWith('/dashboard')) {
        return { kind: 'spa', path };
    }

    if (!path.startsWith('/api/dashboard')) {
        return { kind: 'not-dashboard' };
    }

    if (method === 'OPTIONS') {
        return { kind: 'api-preflight' };
    }

    if (path.startsWith('/api/dashboard/admin')) {
        return { kind: 'api-admin', path, method };
    }

    if (path.startsWith('/api/dashboard/user')) {
        return { kind: 'api-user', path, method };
    }

    // 公开接口：验证码 / 登录 / 公开设置
    if (
        path === '/api/dashboard/captcha'
        || path === '/api/dashboard/auth/login'
        || path === '/api/dashboard/settings/public'
    ) {
        return { kind: 'api-public', path, method };
    }

    return { kind: 'api-unknown', path, method };
}
