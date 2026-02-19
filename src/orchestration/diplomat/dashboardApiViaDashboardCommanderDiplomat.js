/**
 * L2 - Diplomat
 * IndexDO：把 /api/dashboard 请求交给 Dashboard 子系统处理（2-A：视为内部业务）。
 *
 * 为什么是 Diplomat：
 * - 需要访问 UserDO（stub.fetch）作为 userDataStore（外部 I/O）
 * - 需要调用 Dashboard 子系统的 L2（dataOfficer + commander）做编排
 *
 * 约定：
 * - 这里不实现 dashboard 业务逻辑，只做“接线 + I/O 封装”。
 */

import { parseDashboardRoute } from '../../dashboard/orchestration/dataOfficer/dashboardRouteDataOfficer.js';
import { handle as dashboardCommanderHandle } from '../../dashboard/orchestration/commander/dashboardCommander.js';
import { setRequestIdHeader } from '../../utils/logger.js';

const USER_ORIGIN = 'https://user';
const USER_ENDPOINTS = { USER_DATA: '/_internal/user-data' };

function buildUrl(origin, pathname, params) {
    const url = new URL(pathname, origin);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v === undefined || v === null) continue;
            url.searchParams.set(k, String(v));
        }
    }
    return url.toString();
}

async function fetchJsonOrNull(stub, url, init, requestId) {
    const headers = new Headers(init?.headers || {});
    setRequestIdHeader(headers, requestId);
    const resp = await stub.fetch(url, { ...init, headers });
    if (!resp.ok) return null;
    return await resp.json();
}

export async function handleDashboardApiViaDashboardCommander({ request, env, storage, requestId }) {
    const userDataStore = {
        get: async (userId) => {
            const id = env.USER_DO.idFromName(String(userId));
            const stub = env.USER_DO.get(id);
            const body = await fetchJsonOrNull(
                stub,
                buildUrl(USER_ORIGIN, USER_ENDPOINTS.USER_DATA),
                { method: 'GET', headers: { 'X-User-Id': String(userId) } },
                requestId
            );
            return body?.data ?? null;
        },
        put: async (userId, data) => {
            const id = env.USER_DO.idFromName(String(userId));
            const stub = env.USER_DO.get(id);
            const resp = await stub.fetch(buildUrl(USER_ORIGIN, USER_ENDPOINTS.USER_DATA), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-Id': String(userId),
                    'X-Request-Id': requestId,
                },
                body: JSON.stringify({ data }),
            });
            return resp.ok;
        },
        delete: async (userId) => {
            const id = env.USER_DO.idFromName(String(userId));
            const stub = env.USER_DO.get(id);
            const resp = await stub.fetch(buildUrl(USER_ORIGIN, USER_ENDPOINTS.USER_DATA), {
                method: 'DELETE',
                headers: { 'X-User-Id': String(userId), 'X-Request-Id': requestId },
            });
            return resp.ok;
        },
    };

    const ctx = { storage, userDataStore };
    const route = parseDashboardRoute(request);

    // 传入 env.DB（IndexDO 的 storage + userDataStore），让 dashboard 子系统保持原有调用口径
    return await dashboardCommanderHandle({ request, env: { ...env, DB: ctx }, route });
}
