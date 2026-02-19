/**
 * L3 - Molecule
 * SPA 路由：所有 /dashboard/* 返回 index.html。
 */

export async function serveDashboardSpa({ request, env, io }) {
    const indexUrl = new URL(request.url);
    indexUrl.pathname = '/dashboard/index.html';
    return await io.fetchDashboardAsset({ env, requestOrUrl: indexUrl.toString() });
}
