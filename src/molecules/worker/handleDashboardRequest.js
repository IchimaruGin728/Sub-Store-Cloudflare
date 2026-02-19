/**
 * L3 - Molecule
 * 处理 dashboard 相关请求：
 * - /api/dashboard 交给 IndexDO 处理（保持现有逻辑）
 * - /dashboard/assets/* 走静态资源
 * - /dashboard/* 走 SPA index.html
 */

import { fetchIndexDo } from '../../atoms/cf/bindings.js';
import { fetchAsset } from '../../atoms/cf/bindings.js';

export async function handleDashboardRequest({ request, env, requestId, route }) {
    const { isApi, isAssets } = route.dashboard;

    if (isApi) {
        return await fetchIndexDo({ request, env, requestId });
    }

    if (isAssets) {
        return await fetchAsset({ requestOrUrl: request, env });
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = '/dashboard/index.html';
    return await fetchAsset({ requestOrUrl: indexUrl.toString(), env });
}

