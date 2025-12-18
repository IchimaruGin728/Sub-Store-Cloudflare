/**
 * 日志模块
 * 
 * 通过环境变量 DEBUG 控制日志级别
 * - DEBUG=true: 输出所有日志
 * - DEBUG=false/undefined: 只输出重要日志
 */

// 是否处于 debug 模式（从环境变量或 wrangler.toml 的 vars 获取）
let debugMode = false;

/**
 * 设置 debug 模式
 * @param {boolean} enabled 
 */
export function setDebugMode(enabled) {
    debugMode = enabled;
}

/**
 * 从环境变量初始化 debug 模式
 * @param {object} env - Workers 环境变量
 */
export function initLogger(env) {
    debugMode = env?.DEBUG === 'true' || env?.DEBUG === true;
    if (debugMode) {
        console.log('[Logger] Debug 模式已启用');
    }
}

/**
 * 普通日志 - 始终输出
 */
export function log(...args) {
    console.log(...args);
}

/**
 * 调试日志 - 仅 debug 模式输出
 */
export function debug(...args) {
    if (debugMode) {
        console.log('[DEBUG]', ...args);
    }
}

/**
 * 信息日志 - 始终输出
 */
export function info(...args) {
    console.log('[INFO]', ...args);
}

/**
 * 警告日志 - 始终输出
 */
export function warn(...args) {
    console.warn('[WARN]', ...args);
}

/**
 * 错误日志 - 始终输出
 */
export function error(...args) {
    console.error('[ERROR]', ...args);
}

/**
 * Workers 请求日志 - debug 模式输出详细信息
 */
export function request(requestId, ...args) {
    if (debugMode) {
        console.log(`[Workers] [${requestId}]`, ...args);
    }
}

/**
 * Workers 简略请求日志 - 始终输出
 */
export function requestBrief(requestId, method, path) {
    console.log(`[Workers] [${requestId}] ${method} ${path}`);
}

// 默认导出
export default {
    setDebugMode,
    initLogger,
    log,
    debug,
    info,
    warn,
    error,
    request,
    requestBrief
};
