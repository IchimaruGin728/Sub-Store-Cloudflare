/**
 * Sub-Store Workers 入口文件 (Multi-Tenant)
 * 每个用户通过其专属路径访问独立的 Sub-Store
 */

// 初始化全局 polyfills（必须在 import Sub-Store 之前）
import './core/globals.js';

import { handleCORS } from './core/request.js';
import { initLogger, info, error } from './utils/logger.js';
export { IndexDO } from './durable-objects/IndexDO.js';
export { UserDO } from './durable-objects/UserDO.js';

function getIndexStub(env) {
    const id = env.INDEX_DO.idFromName('index');
    return env.INDEX_DO.get(id);
}

async function getUserByPathFromIndex(env, userPath) {
    const index = getIndexStub(env);
    const url = `https://index/_internal/index/user/by-path?path=${encodeURIComponent(userPath)}`;
    const resp = await index.fetch(url, { method: 'GET' });
    if (!resp.ok) return null;
    return await resp.json();
}

async function listUsersFromIndex(env, afterId, limit) {
    const index = getIndexStub(env);
    const url = `https://index/_internal/index/users/list?afterId=${afterId}&limit=${limit}`;
    const resp = await index.fetch(url, { method: 'GET' });
    if (!resp.ok) return { results: [] };
    return await resp.json();
}

function getUserStub(env, userId) {
    const id = env.USER_DO.idFromName(String(userId));
    return env.USER_DO.get(id);
}

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
            if (url.pathname.startsWith('/api/dashboard')) {
                return getIndexStub(env).fetch(request);
            }

            // 静态资源与 SPA 路由仍由 Worker 本身处理
            if (url.pathname.startsWith('/dashboard/assets/')) {
                return env.ASSETS.fetch(request);
            }
            // SPA：所有 /dashboard/* 返回 index.html
            const indexUrl = new URL(request.url);
            indexUrl.pathname = '/dashboard/index.html';
            return env.ASSETS.fetch(indexUrl.toString());
        }

        // 2. 尝试匹配用户路径
        if (pathSegments.length === 0) {
            return new Response('Not Found', { status: 404 });
        }

        const userPath = pathSegments[0];
        const user = await getUserByPathFromIndex(env, userPath);

        if (!user) {
            return new Response('Not Found', { status: 404 });
        }

        // 3. 重写路径：去掉用户前缀
        const newUrl = new URL(request.url);
        newUrl.pathname = '/' + pathSegments.slice(1).join('/');
        newUrl.search = url.search;
        const forwardedRequest = new Request(newUrl.toString(), request);
        forwardedRequest.headers.set('X-User-Id', String(user.id));
        forwardedRequest.headers.set('X-Username', user.username);
        forwardedRequest.headers.set('X-Role', user.role);
        forwardedRequest.headers.set('X-User-Path', user.path);

        // 4. 转发到用户 Durable Object（同一用户串行）
        return getUserStub(env, user.id).fetch(forwardedRequest);
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
            const index = getIndexStub(env);
            const settingsResp = await index.fetch('https://index/_internal/index/settings', { method: 'GET' });
            const settings = settingsResp.ok ? await settingsResp.json() : {};

            const batchSize = Math.max(1, parseInt(settings.cronBatchSize ?? 50, 10));
            const maxUsers = Math.max(0, parseInt(settings.cronMaxUsers ?? 200, 10));
            const timeBudgetMs = Math.max(1000, parseInt(settings.cronTimeBudgetMs ?? 20000, 10));
            let lastUserId = Math.max(0, parseInt(settings.cronLastUserId ?? 0, 10));

            let processed = 0;
            let lastProcessedId = lastUserId;
            let finishedAll = false;
            let stopReason = '';
            const startTime = Date.now();

            outer: while (true) {
                if (Date.now() - startTime > timeBudgetMs) {
                    stopReason = 'time-budget';
                    break;
                }

                const page = await listUsersFromIndex(env, lastProcessedId, batchSize);
                const users = page?.results || [];
                if (users.length === 0) {
                    finishedAll = true;
                    break;
                }

                for (const user of users) {
                    if (maxUsers > 0 && processed >= maxUsers) {
                        stopReason = 'max-users';
                        break outer;
                    }
                    if (Date.now() - startTime > timeBudgetMs) {
                        stopReason = 'time-budget';
                        break outer;
                    }

                    const userReq = new Request('https://user/_internal/cron', {
                        method: 'POST',
                        headers: {
                            'X-User-Id': String(user.id),
                            'X-Username': user.username,
                            'X-Role': user.role,
                            'X-User-Path': user.path,
                        },
                    });
                    await getUserStub(env, user.id).fetch(userReq);

                    processed += 1;
                    lastProcessedId = user.id;
                }
            }

            if (finishedAll) {
                await index.fetch('https://index/_internal/index/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cronLastUserId: 0 }),
                });
            } else if (lastProcessedId > 0) {
                await index.fetch('https://index/_internal/index/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ cronLastUserId: lastProcessedId }),
                });
            }

            if (stopReason === 'max-users') {
                info(`[Cron] 已达到本次最大处理上限: ${maxUsers}`);
            } else if (stopReason === 'time-budget') {
                info(`[Cron] 超出时间预算(${timeBudgetMs}ms)，提前结束`);
            }

            info(`[Cron] 定时任务执行完成，处理用户数: ${processed}`);
        } catch (err) {
            error('[Cron] 定时任务执行失败:', err.message);
        }
    },
};
