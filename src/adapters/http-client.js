/**
 * Sub-Store HTTP 客户端适配器
 * 使用 Workers 原生 fetch 实现 Surge $httpClient 接口
 */

import { debug, warn, error } from '../utils/logger.js';

export function createHttpClient() {
    const methods = ['get', 'post', 'put', 'delete', 'head', 'options', 'patch'];

    const client = {};

    methods.forEach((method) => {
        client[method] = (opts, callback) => {
            const options = typeof opts === 'string' ? { url: opts } : { ...opts };

            debug(`[HTTP] 请求: ${method.toUpperCase()} ${options.url}`);

            const fetchOptions = {
                method: method.toUpperCase(),
                headers: { ...options.headers } || {},
            };

            // 处理请求体
            if (options.body) {
                if (typeof options.body === 'object') {
                    fetchOptions.body = JSON.stringify(options.body);
                    fetchOptions.headers['Content-Type'] =
                        fetchOptions.headers['Content-Type'] || 'application/json';
                } else {
                    fetchOptions.body = options.body;
                }
            }

            // 处理超时 - 最小 10 秒，最大 55 秒 (Workers 限制 60 秒)
            let timeout = options.timeout || 30000;
            // 如果传入值小于 1000，假设是秒数
            if (timeout > 0 && timeout < 1000) {
                timeout = timeout * 1000;
            }
            // 确保最小 10 秒
            timeout = Math.max(timeout, 10000);
            // 确保不超过 55 秒
            timeout = Math.min(timeout, 55000);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                warn(`[HTTP] 超时: ${timeout}ms - ${options.url}`);
                controller.abort();
            }, timeout);
            fetchOptions.signal = controller.signal;

            // Workers 不支持某些 fetch 选项，需要移除
            // 例如：insecureHTTPParser, rejectUnauthorized 等
            delete fetchOptions.insecure;
            delete fetchOptions.rejectUnauthorized;

            fetch(options.url, fetchOptions)
                .then(async (response) => {
                    clearTimeout(timeoutId);

                    let body;

                    if (options.encoding === null) {
                        // 返回 ArrayBuffer
                        body = await response.arrayBuffer();
                    } else {
                        body = await response.text();
                    }

                    // 转换 headers 为普通对象
                    const headers = {};
                    response.headers.forEach((value, key) => {
                        headers[key] = value;
                    });

                    debug(`[HTTP] 响应: ${method.toUpperCase()} ${options.url} -> ${response.status}`);

                    callback(null, {
                        status: response.status,
                        statusCode: response.status,
                        headers: headers,
                    }, body);
                })
                .catch((err) => {
                    clearTimeout(timeoutId);
                    error(`[HTTP] 错误: ${method.toUpperCase()} ${options.url} - ${err.message}`);
                    callback(err.message || String(err), null, null);
                });
        };
    });

    return client;
}
