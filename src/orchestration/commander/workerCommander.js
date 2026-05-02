/**
 * L2 - Commander
 * Worker 入口编排：只负责选择执行顺序，不实现业务逻辑/数据处理/IO。
 */

import { parseWorkerHttpRoute } from '../dataOfficer/workerHttpDataOfficer.js';
import { normalizeCronSettings } from '../dataOfficer/cronDataOfficer.js';
import { handleUserPathRequest } from '../../molecules/worker/handleUserPathRequest.js';
import { runCronBatch } from '../../molecules/worker/runCronBatch.js';
import { buildCorsPreflightResponse, buildNotFoundResponse, jsonResponse } from '../../atoms/http/httpAtoms.js';

async function hasSecretStoreSecret(env) {
    try {
        if (typeof env.JWT_SECRET_STORE?.get !== 'function') return false;
        const secret = await env.JWT_SECRET_STORE.get();
        return typeof secret === 'string' && secret.length > 0;
    } catch {
        return false;
    }
}

export async function handleHttp({ request, env, ctx, requestId }) {
    const route = parseWorkerHttpRoute(request);

    if (route.kind === 'cors-preflight') {
        return buildCorsPreflightResponse();
    }

    if (route.kind === 'health') {
        return jsonResponse({
            ok: true,
            backend: env.SUB_STORE_BACKEND_CUSTOM_NAME || 'Cloudflare Workers',
            adapter: 'Sub-Store Cloudflare',
            runtime: 'workerd',
            secretStore: await hasSecretStoreSecret(env),
        });
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
