/**
 * 请求/响应处理
 * 解析请求和构建响应
 */

import { debug } from '../utils/logger.js';

/**
 * CORS 响应头
 */
export const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS,PATCH,PUT,DELETE',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
};

/**
 * 处理 CORS 预检请求
 */
export function handleCORS() {
    return new Response(null, { headers: CORS_HEADERS });
}

/**
 * 解析请求
 */
export async function parseRequest(request, basePath) {
    const originalUrl = new URL(request.url);

    // 重写 URL：用 basePath 替换原路径（去掉用户前缀）
    const rewrittenUrl = new URL(originalUrl);
    rewrittenUrl.pathname = basePath.split('?')[0];  // basePath 可能包含 query string

    let body = '';
    if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
            body = await request.text();
        } catch (e) {
            body = '';
        }
    }

    const headers = {};
    request.headers.forEach((value, key) => {
        headers[key] = value;
    });

    return {
        method: request.method,
        url: rewrittenUrl.href,  // 重写后的 URL（不含用户前缀）
        path: basePath,
        headers: headers,
        body: body,
    };
}

/**
 * 构建 Sub-Store 响应
 */
export function buildResponse(result) {
    if (!result) {
        return new Response('No response', { status: 500 });
    }

    // Surge 模式：result = { response: { status, body, headers } }
    // QX 模式：result = { status, body, headers }
    const response = result.response || result;

    let status = 200;
    if (typeof response.status === 'number') {
        status = response.status;
    } else if (typeof response.status === 'string') {
        const match = response.status.match(/\d+/);
        status = match ? parseInt(match[0], 10) : 200;
    }

    debug('[Workers] buildResponse parsed status:', status, 'body length:', response.body?.length || 0);

    return new Response(response.body || '', {
        status: status,
        headers: response.headers || {
            'Content-Type': 'text/plain;charset=UTF-8',
            ...CORS_HEADERS,
        },
    });
}

/**
 * 构建错误响应
 */
export function buildErrorResponse(message, status = 500) {
    return new Response(
        JSON.stringify({ status: 'failed', message }),
        { status, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } }
    );
}
