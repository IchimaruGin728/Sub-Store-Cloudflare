/**
 * Sub-Store Workers 入口文件 (Multi-Tenant)
 * 每个用户通过其专属路径访问独立的 Sub-Store
 */

// 初始化全局 polyfills（必须在 import Sub-Store 之前）
import './core/globals.js';

import { handleDashboardRequest } from './dashboard/router.js';
import { getUserByPath } from './dashboard/user.js';
import { setupGlobals } from './core/globals.js';
import { handleSubStoreHttpRequest, handleSubStoreCronRequest } from './core/substore.js';
import { handleCORS } from './core/request.js';
import { initLogger, info, error } from './utils/logger.js';

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

        const url = new URL(request.url);
        const pathSegments = url.pathname.split('/').filter(Boolean);

        // CORS 预检
        if (request.method === 'OPTIONS') {
            return handleCORS();
        }

        // 1. Dashboard 路由 (优先)
        if (url.pathname.startsWith('/dashboard') || url.pathname.startsWith('/api/dashboard')) {
            setupGlobals(env);
            return handleDashboardRequest(request, env);
        }

        // 2. 尝试匹配用户路径
        if (pathSegments.length === 0) {
            return new Response('Not Found', { status: 404 });
        }

        const userPath = pathSegments[0];
        const user = await getUserByPath(env.DB, userPath);

        if (!user) {
            return new Response('Not Found', { status: 404 });
        }

        // 3. 重写路径：去掉用户前缀
        const subStorePath = '/' + pathSegments.slice(1).join('/') + url.search;

        // 4. 处理 Sub-Store 请求
        return handleSubStoreHttpRequest({
            user,
            env,
            ctx,
            request,
            subStorePath,
        });
    },

    /**
     * Scheduled (Cron) Handler
     * 遍历所有用户执行定时任务
     */
    async scheduled(event, env, ctx) {
        // 初始化日志模块
        initLogger(env);
        info('[Cron] 开始执行定时任务...');

        try {
            // 获取所有用户
            const { results: users } = await env.DB.prepare('SELECT * FROM users').all();
            info(`[Cron] 找到 ${users.length} 个用户`);

            // 遍历处理每个用户
            for (const user of users) {
                await handleSubStoreCronRequest({ user, env });
            }

            info('[Cron] 定时任务执行完成');
        } catch (err) {
            error('[Cron] 定时任务执行失败:', err.message);
        }
    },
};
