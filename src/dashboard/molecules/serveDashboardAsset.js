/**
 * L3 - Molecule
 * 返回 /dashboard/assets/* 静态资源。
 */

export async function serveDashboardAsset({ request, env, io }) {
    return await io.fetchDashboardAsset({ env, requestOrUrl: request });
}
