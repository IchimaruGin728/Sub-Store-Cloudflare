/**
 * L4 - Atom
 * 在 UserDO 内执行 Sub-Store HTTP 请求（每个用户串行）。
 *
 * 说明：
 * - 该 atom 是“Sub-Store 引擎”的运行封装（对本项目来说属于实现细节）。
 * - 为避免混层，已不再依赖 `src/core/substore.js`。
 */

import { initSubStore } from '../../core/substore-loader.js';
import { debug, warn, error as logError } from '../../utils/logger.js';
import { createHttpClient } from '../../adapters/http-client.js';
import { ensureSubStoreQuickJsScriptEngineInstalled } from '../../adapters/quickjs/substore-script-engine.js';
import { ensureSurgeGeoipInstalled } from '../surge/geoip/ensureSurgeGeoipInstalled.js';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import streamPromises from 'node:stream/promises';

function parseUserSettings(user) {
    try {
        const userData = JSON.parse(user?.data || '{}');
        return userData?.__settings__ || {};
    } catch {
        return {};
    }
}

function ensurePolyfills() {
    // Buffer
    globalThis.Buffer = Buffer;

    // Node.js 原生模块 shim（Sub-Store 代码替换需要）
    globalThis.__path_shim__ = path;
    globalThis.__stream_promises_shim__ = streamPromises;

    // process shim（必须在导入 Sub-Store 前可用）
    if (!globalThis.process) {
        globalThis.process = {
            env: {},
            version: 'v20.0.0',
            argv: [],
            cwd: () => '/',
        };
    }

    // fs shim（空实现）
    if (!globalThis.__fs_shim__) {
        globalThis.__fs_shim__ = {
            existsSync: () => false,
            readFileSync: () => '',
            writeFileSync: () => {},
            copyFileSync: () => {},
        };
    }

    // ms shim（时间字符串解析）
    if (!globalThis.__ms_shim__) {
        globalThis.__ms_shim__ = (val) => {
            if (typeof val === 'number') return val;
            const match = String(val).match(/^(\d+)(ms|s|m|h|d|w|y)?$/);
            if (!match) return 0;
            const num = parseInt(match[1], 10);
            const unit = match[2] || 'ms';
            const multipliers = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 };
            return num * (multipliers[unit] || 1);
        };
    }
}

function setupGlobalsForSubStore(env, userSettings, ctx) {
    // Surge $httpClient
    globalThis.$httpClient = createHttpClient();

    const notification = userSettings?.notification || { type: 'none' };

    // Surge $notification（支持 Bark/Pushover）
    globalThis.$notification = {
        post: (title, subtitle, content) => {
            debug(`[Notification] ${title}: ${subtitle} - ${content}`);

            const sendNotification = async () => {
                try {
                    if (notification.type === 'bark' && notification.bark?.deviceKey) {
                        await sendBarkNotification(notification.bark, title, subtitle, content);
                    } else if (notification.type === 'pushover' && notification.pushover?.userKey) {
                        await sendPushoverNotification(notification.pushover, title, subtitle, content);
                    }
                } catch (e) {
                    logError('[Notification] 推送失败:', e?.message || e);
                }
            };

            if (ctx && typeof ctx.waitUntil === 'function') {
                ctx.waitUntil(sendNotification());
            } else {
                sendNotification();
            }
        },
    };

    globalThis.$environment = {
        'surge-version': userSettings?.surgeVersion || '5.0.0',
        'surge-build': userSettings?.surgeBuild || '2000',
        language: 'zh-Hans',
    };

    globalThis.__env__ = env;
    globalThis.process = {
        env: env || {},
        version: 'v20.0.0',
        argv: [],
        cwd: () => '/',
    };
    globalThis.__filename = '/worker.js';
    globalThis.__dirname = '/';
}

async function sendBarkNotification(config, title, subtitle, content) {
    const { serverUrl, deviceKey, group } = config;
    if (!serverUrl || !deviceKey) return;

    const fullTitle = subtitle ? `${title} - ${subtitle}` : title;
    const baseUrl = serverUrl.replace(/\/$/, '');
    const params = new URLSearchParams({
        group: group || 'SubStore',
        autoCopy: '1',
        isArchive: '1',
        sound: 'shake',
        level: 'timeSensitive',
        icon: 'https://raw.githubusercontent.com/58xinian/icon/master/Sub-Store1.png',
    });

    const url = `${baseUrl}/${encodeURIComponent(deviceKey)}/${encodeURIComponent(fullTitle)}/${encodeURIComponent(content)}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Bark 推送失败: ${res.status}`);
}

async function sendPushoverNotification(config, title, subtitle, content) {
    const { userKey, appToken } = config;
    if (!userKey || !appToken) return;

    const fullTitle = subtitle ? `${title} - ${subtitle}` : title;
    const res = await fetch('https://api.pushover.net/1/messages.json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            token: appToken,
            user: userKey,
            title: fullTitle,
            message: content,
        }),
    });
    if (!res.ok) throw new Error(`Pushover 推送失败: ${res.status}`);
}

async function buildSubStoreRequest(request, subStorePath) {
    const originalUrl = new URL(request.url);
    const rewrittenUrl = new URL(originalUrl);
    rewrittenUrl.pathname = String(subStorePath || '').split('?')[0];

    let body = '';
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
            body = await request.text();
        } catch {
            body = '';
        }
    }

    const headers = {};
    request.headers.forEach((value, key) => {
        headers[key] = value;
    });

    return {
        method: request.method,
        url: rewrittenUrl.href,
        path: subStorePath,
        headers,
        body,
    };
}

function buildResponseFromSubStoreResult(result) {
    if (!result) return new Response('No response', { status: 500 });

    const CORS_HEADERS = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST,GET,OPTIONS,PATCH,PUT,DELETE',
        'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    };

    const response = result.response || result;

    let status = 200;
    if (typeof response.status === 'number') status = response.status;
    else if (typeof response.status === 'string') {
        const match = response.status.match(/\d+/);
        status = match ? parseInt(match[0], 10) : 200;
    }

    return new Response(response.body || '', {
        status,
        headers: response.headers || { 'Content-Type': 'text/plain;charset=UTF-8', ...CORS_HEADERS },
    });
}

export async function runSubStoreHttpForUser({ user, env, state, request, subStorePath }) {
    const ctx = { waitUntil: (p) => state.waitUntil(p) };
    ensurePolyfills();

    // Install QuickJS script engine hook before Sub-Store handles user scripts.
    // (Upstream user scripts rely on new Function, which is forbidden in Workers.)
    ensureSubStoreQuickJsScriptEngineInstalled();

    const userSettings = parseUserSettings(user);
    setupGlobalsForSubStore(env, userSettings, ctx);

    // Surge $utils.geoip/ipasn/ipaso (GeoIP) — load once per isolate, then sync lookups.
    await ensureSurgeGeoipInstalled(env);

    // 初始化用户专属存储
    const userStorage = (() => {
        const DEFAULT_KEY = '__default__';
        let userData = {};
        try {
            userData = JSON.parse(user?.data || '{}');
        } catch {
            userData = {};
        }
        return {
            read: (key) => {
                const storageKey = key || DEFAULT_KEY;
                const value = userData[storageKey];
                if (value === undefined || value === null) return null;
                if (typeof value === 'object') return JSON.stringify(value);
                return String(value);
            },
            write: (data, key) => {
                const storageKey = key || DEFAULT_KEY;
                userData[storageKey] = data;
                globalThis.__user_data_dirty__ = true;
                globalThis.__user_data__ = userData;
                if (storageKey === 'sub-store') {
                    debug('[Workers] 检测到备份恢复，标记需要重新初始化');
                    globalThis.__need_reinit__ = true;
                }
                return true;
            },
            getData: () => userData,
        };
    })();
    globalThis.$persistentStore = userStorage;
    globalThis.__user_data_dirty__ = false;
    globalThis.__user_data__ = null;

    // 兼容 open-api 补丁：使用 requestId 标识本次请求的缓存槽位
    const requestId = globalThis.__current_request_id__ || `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
    globalThis.__current_request_id__ = requestId;
    if (!globalThis.__substore_request_caches__) {
        globalThis.__substore_request_caches__ = new Map();
    }
    const cacheData = (() => {
        try {
            return JSON.parse(userStorage.read('sub-store') || '{}');
        } catch {
            return {};
        }
    })();
    globalThis.__substore_request_caches__.set(requestId, cacheData);

    // 解析为 Sub-Store 期望的 $request
    const $request = await buildSubStoreRequest(request, subStorePath);
    debug(`[SubStoreAtom] [${requestId}] ${$request.method} ${$request.path}`);

    // $done 回调（Sub-Store 会异步调用）
    let timeoutId = null;
    const result = await new Promise((resolve) => {
        globalThis.$done = (res) => {
            if (timeoutId) clearTimeout(timeoutId);
            resolve(res);
        };
        timeoutId = setTimeout(() => {
            warn(`[SubStoreAtom] [${requestId}] 请求超时`);
            resolve({
                status: 504,
                body: JSON.stringify({ status: 'failed', message: 'Gateway Timeout' }),
                headers: { 'Content-Type': 'application/json' },
            });
        }, 25000);

        // 初始化并触发 dispatch
        initSubStore($request).catch((e) => {
            if (timeoutId) clearTimeout(timeoutId);
            logError(`[SubStoreAtom] [${requestId}] initSubStore failed:`, e?.message || e);
            resolve({ status: 500, body: 'Internal Server Error' });
        });
    });

    // 持久化（由外部注入 __saveUserData 落库到 UserDO）
    if (typeof env?.__saveUserData === 'function') {
        state.waitUntil(Promise.resolve(env.__saveUserData(user?.id)));
    }

    if (globalThis.__substore_request_caches__) {
        globalThis.__substore_request_caches__.delete(requestId);
    }

    return buildResponseFromSubStoreResult(result);
}
