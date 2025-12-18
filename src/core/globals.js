/**
 * 全局环境设置
 * 初始化 Sub-Store 所需的全局对象和适配器
 * 注意：import Sub-Store 前，必须先调用此模块
 */

import { createHttpClient } from '../adapters/http-client.js';
import { debug, info, error } from '../utils/logger.js';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import streamPromises from 'node:stream/promises';

/**
 * 初始化全局 Polyfills（模块加载时执行一次）
 */
export function initPolyfills() {
    // Buffer
    globalThis.Buffer = Buffer;

    // Node.js 原生模块 shim
    globalThis.__path_shim__ = path;
    globalThis.__stream_promises_shim__ = streamPromises;

    // CRITICAL: 设置 process 必须在导入 Sub-Store 之前
    globalThis.process = {
        env: {},
        version: 'v20.0.0',
        argv: [],
        cwd: () => '/',
    };

    // 注入 fs shim (空实现)
    globalThis.__fs_shim__ = {
        existsSync: () => false,
        readFileSync: () => '',
        writeFileSync: () => { },
        copyFileSync: () => { },
    };

    // 注入 ms shim (时间字符串解析)
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

/**
 * 初始化全局环境（模拟 Surge）
 * @param {object} env - Worker 环境变量
 * @param {object} userSettings - 用户自定义设置
 */
export function setupGlobals(env, userSettings = {}, ctx = null) {
    // 模拟 Surge $httpClient
    globalThis.$httpClient = createHttpClient();

    // 获取通知配置
    const notification = userSettings.notification || { type: 'none' };

    // 模拟 Surge $notification（支持 Bark 和 Pushover）
    globalThis.$notification = {
        post: (title, subtitle, content, opts) => {
            // 始终打印到控制台
            debug(`[Notification] ${title}: ${subtitle} - ${content}`);

            // 根据用户配置发送推送
            const sendNotification = async () => {
                try {
                    if (notification.type === 'bark' && notification.bark?.deviceKey) {
                        await sendBarkNotification(notification.bark, title, subtitle, content);
                    } else if (notification.type === 'pushover' && notification.pushover?.userKey) {
                        await sendPushoverNotification(notification.pushover, title, subtitle, content);
                    }
                } catch (e) {
                    error('[Notification] 推送失败:', e.message);
                }
            };

            // 使用 ctx.waitUntil 确保请求完成，否则 fire-and-forget
            if (ctx && typeof ctx.waitUntil === 'function') {
                ctx.waitUntil(sendNotification());
            } else {
                sendNotification();
            }
        },
    };

    // 模拟 Surge 环境变量（使用用户自定义值）
    globalThis.$environment = {
        'surge-version': userSettings.surgeVersion || '5.0.0',
        'surge-build': userSettings.surgeBuild || '2000',
        language: 'zh-Hans',
    };

    // 注入环境变量
    globalThis.__env__ = env;

    // Node.js process polyfill
    globalThis.process = {
        env: env || {},
        version: 'v20.0.0',
        argv: [],
        cwd: () => '/',
    };

    // Node.js __filename / __dirname polyfill
    globalThis.__filename = '/worker.js';
    globalThis.__dirname = '/';
}

/**
 * 发送 Bark 通知
 */
async function sendBarkNotification(config, title, subtitle, content) {
    const { serverUrl, deviceKey, group } = config;
    if (!serverUrl || !deviceKey) return;

    const fullTitle = subtitle ? `${title} - ${subtitle}` : title;
    const baseUrl = serverUrl.replace(/\/$/, '');

    // 构建 URL 参数
    const params = new URLSearchParams({
        group: group || 'SubStore',
        autoCopy: '1',
        isArchive: '1',
        sound: 'shake',
        level: 'timeSensitive',
        icon: 'https://raw.githubusercontent.com/58xinian/icon/master/Sub-Store1.png'
    });

    const url = `${baseUrl}/${encodeURIComponent(deviceKey)}/${encodeURIComponent(fullTitle)}/${encodeURIComponent(content)}?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Bark 推送失败: ${res.status}`);
    }
    info('[Notification] Bark 推送成功');
}

/**
 * 发送 Pushover 通知
 */
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
            message: content
        })
    });

    if (!res.ok) {
        throw new Error(`Pushover 推送失败: ${res.status}`);
    }
    info('[Notification] Pushover 推送成功');
}

// 模块加载时初始化 polyfills
initPolyfills();

