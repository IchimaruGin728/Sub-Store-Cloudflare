/**
 * Sub-Store 执行引擎
 * 核心可复用逻辑：初始化用户环境、执行请求、等待完成
 */

import { requestContext } from '../utils/context.js';
import { setupGlobals } from './globals.js';
import { createUserStorage, saveUserData, resetUserDataFlags } from './storage.js';
import { buildResponse, buildErrorResponse } from './request.js';
import { debug, info, warn, error } from '../utils/logger.js';

// 请求队列：用于隔离并发请求的响应回调
const pendingRequests = new Map();
let requestCounter = 0;

/**
 * 获取下一个请求 ID
 */
export function getNextRequestId() {
    return ++requestCounter;
}

/**
 * 设置全局 $done 回调（用于 HTTP 请求）
 */
function setupDoneCallback() {
    globalThis.$done = (result) => {
        const currentRequestId = requestContext.getStore();
        debug(`[Workers] [${currentRequestId}] $done called`);

        if (currentRequestId && pendingRequests.has(currentRequestId)) {
            const pending = pendingRequests.get(currentRequestId);
            pendingRequests.delete(currentRequestId);
            pending.resolve(result);
        } else {
            warn(`[Workers] $done called but no pending request found for ID: ${currentRequestId}`);
        }
    };
}

/**
 * 执行 Sub-Store 请求（核心复用逻辑）
 * 用于 fetch handler 和 cron handler
 */
export async function executeSubStoreRequest(options) {
    const {
        user,
        env,
        requestId,
        $request,
        timeout = 25000,
        useDoneCallback = true,
        onComplete = null,  // Cron 模式下使用自定义回调
    } = options;

    debug(`[Workers] [${requestId}] 初始化 Sub-Store... (用户 ID: ${user.id})`);

    // 创建用户专属存储
    const userStorage = createUserStorage(user);
    globalThis.$persistentStore = userStorage;
    resetUserDataFlags();

    // 创建响应 Promise
    const responsePromise = new Promise((resolve) => {
        if (useDoneCallback) {
            // HTTP 请求模式：使用 pendingRequests
            pendingRequests.set(requestId, {
                resolve,
                path: $request.path,
                timestamp: Date.now(),
            });
        } else {
            // Cron 模式：使用自定义 $done
            globalThis.$done = (result) => {
                debug(`[Workers] [${requestId}] $done called (cron mode)`);
                if (onComplete) onComplete(result);
                resolve(result);
            };
        }

        // 超时处理
        setTimeout(() => {
            if (useDoneCallback && pendingRequests.has(requestId)) {
                warn(`[Workers] [${requestId}] 请求超时`);
                pendingRequests.delete(requestId);
                resolve({
                    status: 504,
                    body: JSON.stringify({ status: 'failed', message: 'Gateway Timeout' }),
                    headers: { 'Content-Type': 'application/json' },
                });
            } else if (!useDoneCallback) {
                warn(`[Workers] [${requestId}] 请求超时 (cron mode)`);
                resolve({ status: 504, body: 'Timeout' });
            }
        }, timeout);
    });

    // 初始化并执行 Sub-Store
    const { initSubStore } = await import('./substore-loader.js');
    await initSubStore($request);
    debug(`[Workers] [${requestId}] Sub-Store 初始化完成`);

    // 等待响应
    const result = await responsePromise;

    return result;
}

/**
 * 处理 HTTP 请求（fetch handler 使用）
 */
export async function handleSubStoreHttpRequest(options) {
    const { user, env, ctx, request, subStorePath } = options;

    const requestId = getNextRequestId();
    info(`[Workers] [${requestId}] User: ${user.username}, Path: ${subStorePath}`);

    // 提取用户设置
    let userSettings = {};
    try {
        const userData = JSON.parse(user.data || '{}');
        userSettings = userData.__settings__ || {};
    } catch (e) {
        userSettings = {};
    }

    return requestContext.run(requestId, async () => {
        try {
            setupDoneCallback();
            setupGlobals(env, userSettings, ctx);

            // 解析请求
            const { parseRequest } = await import('./request.js');
            const $request = await parseRequest(request, subStorePath);
            debug(`[Workers] [${requestId}] ${$request.method} ${$request.path}`);

            // 执行 Sub-Store 请求
            const result = await executeSubStoreRequest({
                user,
                env,
                requestId,
                $request,
                timeout: 25000,
                useDoneCallback: true,
            });

            // 保存用户数据
            ctx.waitUntil(saveUserData(env.DB, user.id));

            return buildResponse(result);
        } catch (err) {
            error(`[Workers] [${requestId}] 错误:`, err.message);
            pendingRequests.delete(requestId);
            return buildErrorResponse(err.message || 'Internal Server Error');
        }
    });
}

/**
 * 处理 Cron 请求（scheduled handler 使用）
 */
export async function handleSubStoreCronRequest(options) {
    const { user, env } = options;

    const requestId = `cron-${user.id}-${Date.now()}`;
    debug(`[Cron] 处理用户: ${user.username} (ID: ${user.id})`);

    // 提取用户设置
    let userSettings = {};
    try {
        const userData = JSON.parse(user.data || '{}');
        userSettings = userData.__settings__ || {};
    } catch (e) {
        userSettings = {};
    }

    try {
        setupGlobals(env, userSettings);

        // 模拟刷新请求
        const $request = {
            method: 'GET',
            url: '/api/utils/refresh',
            path: '/api/utils/refresh',
            headers: {},
            body: '',
        };

        // 执行 Sub-Store 请求
        await executeSubStoreRequest({
            user,
            env,
            requestId,
            $request,
            timeout: 60000,  // Cron 使用更长超时
            useDoneCallback: false,
            onComplete: (result) => {
                debug(`[Cron] [${requestId}] 用户 ${user.username} 刷新完成`);
            },
        });

        // 保存用户数据
        await saveUserData(env.DB, user.id);
        debug(`[Cron] 用户 ${user.username} 处理完成`);
    } catch (err) {
        error(`[Cron] 用户 ${user.username} 处理失败:`, err.message);
    }
}
