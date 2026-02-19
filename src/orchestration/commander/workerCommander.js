/**
 * L2 - Commander
 * Worker 入口编排：只负责选择执行顺序，不实现业务逻辑/数据处理/IO。
 */

import { parseWorkerHttpRoute } from '../dataOfficer/workerHttpDataOfficer.js';
import { normalizeCronSettings } from '../dataOfficer/cronDataOfficer.js';
import { handleDashboardRequest } from '../../molecules/worker/handleDashboardRequest.js';
import { handleUserPathRequest } from '../../molecules/worker/handleUserPathRequest.js';
import { runCronBatch } from '../../molecules/worker/runCronBatch.js';
import { buildCorsPreflightResponse } from '../../atoms/http/httpAtoms.js';
import { buildNotFoundResponse } from '../../atoms/http/httpAtoms.js';

export async function handleHttp({ request, env, ctx, requestId }) {
    const route = parseWorkerHttpRoute(request);

    if (route.kind === 'cors-preflight') {
        return buildCorsPreflightResponse();
    }

    if (route.kind === 'dashboard') {
        return await handleDashboardRequest({ request, env, requestId, route });
    }

    if (route.kind === 'blocked-mmdb') {
        // Hide internal mmdb assets from public access
        return buildNotFoundResponse();
    }

    if (route.kind === 'user-path') {
        return await handleUserPathRequest({ request, env, requestId, route });
    }

    return buildNotFoundResponse();
}

export async function handleCron({ event, env, ctx }) {
    const settings = await runCronBatch({
        env,
        settingsNormalizer: normalizeCronSettings,
    });
    return settings;
}
