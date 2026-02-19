/**
 * L4 - Atom
 * 在 UserDO 内执行 Sub-Store Cron 请求（每个用户串行）。
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

function buildRefreshRequest() {
    return {
        method: 'GET',
        url: '/api/utils/refresh',
        path: '/api/utils/refresh',
        headers: {},
        body: '',
    };
}

function ensurePolyfills() {
    globalThis.Buffer = Buffer;
    globalThis.__path_shim__ = path;
    globalThis.__stream_promises_shim__ = streamPromises;

    if (!globalThis.process) {
        globalThis.process = {
            env: {},
            version: 'v20.0.0',
            argv: [],
            cwd: () => '/',
        };
    }

    if (!globalThis.__fs_shim__) {
        globalThis.__fs_shim__ = {
            existsSync: () => false,
            readFileSync: () => '',
            writeFileSync: () => {},
            copyFileSync: () => {},
        };
    }

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

function setupGlobalsForSubStore(env, userSettings) {
    globalThis.$httpClient = createHttpClient();

    const notification = userSettings?.notification || { type: 'none' };
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
            sendNotification();
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

export async function runSubStoreCronForUser({ user, env }) {
    ensurePolyfills();

    // Install QuickJS script engine hook before Sub-Store handles user scripts.
    ensureSubStoreQuickJsScriptEngineInstalled();

    const userSettings = parseUserSettings(user);
    setupGlobalsForSubStore(env, userSettings);

    // Surge $utils.geoip/ipasn/ipaso (GeoIP)
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

    const requestId = `cron-${user?.id || 'unknown'}-${Date.now()}`;
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

    const $request = buildRefreshRequest();
    debug(`[SubStoreAtom] [${requestId}] cron refresh`);

    let timeoutId = null;
    await new Promise((resolve) => {
        globalThis.$done = () => {
            if (timeoutId) clearTimeout(timeoutId);
            resolve();
        };
        timeoutId = setTimeout(() => {
            warn(`[SubStoreAtom] [${requestId}] cron 超时`);
            resolve();
        }, 60000);

        initSubStore($request).catch((e) => {
            if (timeoutId) clearTimeout(timeoutId);
            logError(`[SubStoreAtom] [${requestId}] initSubStore failed:`, e?.message || e);
            resolve();
        });
    });

    if (typeof env?.__saveUserData === 'function') {
        await env.__saveUserData(user?.id);
    }

    if (globalThis.__substore_request_caches__) {
        globalThis.__substore_request_caches__.delete(requestId);
    }
}
