/**
 * L2 - Commander
 * Dashboard 入口编排：只负责选择调用顺序，不实现业务逻辑/数据处理/IO。
 */

import { serveDashboardAsset } from '../../molecules/serveDashboardAsset.js';
import { serveDashboardSpa } from '../../molecules/serveDashboardSpa.js';
import { handleDashboardPublicApi } from '../../molecules/handleDashboardPublicApi.js';
import { handleDashboardUserApi } from '../../molecules/handleDashboardUserApi.js';
import { handleDashboardAdminApi } from '../../molecules/handleDashboardAdminApi.js';
import { buildApiPreflightResponse } from '../../atoms/http/httpAtoms.js';
import { authenticateDashboardRequest } from '../../molecules/authenticateDashboardRequest.js';
import { errorResponse } from '../../atoms/http/httpAtoms.js';
import { enforceAdminPasswordChange } from '../../molecules/enforceAdminPasswordChange.js';
import { error as logError } from '../../../utils/logger.js';
import {
    matchPublicSettingsCache,
    putPublicSettingsCache,
    deletePublicSettingsCache,
    verifyTurnstileToken,
    fetchDashboardAsset,
    fetchMmdbFromUrl,
} from '../diplomat/dashboardDiplomats.js';

export async function handle({ request, env, route }) {
    const io = {
        matchPublicSettingsCache,
        putPublicSettingsCache,
        deletePublicSettingsCache,
        verifyTurnstileToken,
        fetchDashboardAsset,
        fetchMmdbFromUrl,
    };

    if (route.kind === 'assets') {
        return await serveDashboardAsset({ request, env, io });
    }

    if (route.kind === 'spa') {
        return await serveDashboardSpa({ request, env, io });
    }

    if (route.kind === 'api-preflight') {
        return buildApiPreflightResponse();
    }

    try {
        if (route.kind === 'api-public') {
            return await handleDashboardPublicApi({ request, env, route, io });
        }

        if (route.kind === 'api-user' || route.kind === 'api-admin' || route.kind === 'api-unknown') {
            const authPayload = await authenticateDashboardRequest({ request, ctx: env.DB, env });
            if (!authPayload) return errorResponse('Unauthorized', 401);

            if (authPayload.role === 'admin') {
                const res = await enforceAdminPasswordChange({ request, env, authPayload });
                if (res) return res;
            }

            if (route.kind === 'api-user') {
                return await handleDashboardUserApi({ request, env, route, authPayload });
            }

            if (route.kind === 'api-admin') {
                return await handleDashboardAdminApi({ request, env, route, authPayload, io });
            }

            return errorResponse('Not Found', 404);
        }
    } catch (err) {
        logError('[Dashboard]', err);
        return errorResponse(err?.message || 'Internal Server Error', 500);
    }

    return null;
}
