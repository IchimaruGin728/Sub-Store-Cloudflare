/**
 * Sub-Store 初始化包装器
 * 
 * Sub-Store 的 main.js 会在 import 时自动执行。
 * 这个包装器提供延迟初始化功能，以便在 Workers 环境准备好后再执行。
 */

import { debug, error } from '../utils/logger.js';

let initialized = false;

/**
 * 初始化 Sub-Store
 * 必须在全局环境（$httpClient, $persistentStore 等）设置完成后调用
 * @param {object} $request - 当前请求对象，(本地开发使用) 必须传入以避免并发请求覆盖
 */
export async function initSubStore($request) {
    // 在调用 dispatch 之前立即设置 $request，避免被其他并发请求覆盖
    globalThis.$request = $request;

    if (initialized) {
        debug('[SubStore] 已初始化，调用 dispatch 处理请求...');
        // 已初始化时，直接调用 dispatch 处理当前请求
        if (globalThis.__substore_dispatch__) {
            globalThis.__substore_dispatch__($request);
        } else {
            error('[SubStore] dispatch 函数未找到！');
        }
        return;
    }

    // 动态导入 Sub-Store 主入口
    // Vite 会自动应用 subStoreTransformPlugin 进行代码替换
    await import('../../sub-store/backend/src/main.js');

    initialized = true;
    debug('[SubStore] 首次初始化完成');
}

/**
 * 重置初始化状态（用于多租户场景）
 */
export function resetSubStore() {
    initialized = false;
}
