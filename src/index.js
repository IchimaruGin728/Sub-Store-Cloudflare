/**
 * Sub-Store Workers 入口文件 (Multi-Tenant)
 * 每个用户通过其专属路径访问独立的 Sub-Store
 */

import { getRequestId, initLogger, error as logError } from './utils/logger.js';
import { addRequestIdHeaderToResponse } from './atoms/http/httpAtoms.js';
import { handleHttp, handleCron } from './orchestration/commander/workerCommander.js';
export { IndexDO } from './durable-objects/IndexDO.js';
export { UserDO } from './durable-objects/UserDO.js';

/**
 * Workers Export
 */
export default {
    /**
     * HTTP Fetch Handler
     */
    async fetch(request, env, ctx) {
        // 初始化日志模块
        initLogger(env);
        const requestId = getRequestId(request);

        try {
            const response = await handleHttp({ request, env, ctx, requestId });
            return addRequestIdHeaderToResponse(response, requestId);
        } catch (err) {
            logError(`[Worker] [${requestId}] unhandled error:`, err?.stack || err?.message || err);
            const response = new Response('Internal Server Error', { status: 500 });
            return addRequestIdHeaderToResponse(response, requestId);
        }
    },

    /**
     * Scheduled (Cron) Handler
     * 遍历所有用户执行定时任务
     */
    async scheduled(event, env, ctx) {
        // 初始化日志模块
        initLogger(env);

        try {
            await handleCron({ event, env, ctx });
        } catch (err) {
            logError('[Worker] [cron] unhandled error:', err?.stack || err?.message || err);
        }
    },
};
