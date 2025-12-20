/**
 * Dashboard API 路由入口
 * 
 * 路由模块：
 * - routes/public.js  - 公开路由（验证码、登录）
 * - routes/user.js    - 用户路由
 * - routes/admin.js   - 管理员路由
 */
import { authenticateRequest } from './auth.js';
import { corsHeaders, errorResponse } from './utils/response.js';
import { handlePublicRoutes } from './routes/public.js';
import { handleUserRoutes } from './routes/user.js';
import { handleAdminRoutes } from './routes/admin.js';
import { error as logError } from '../utils/logger.js';

/**
 * Handle Dashboard API Requests
 * @param {Request} request 
 * @param {object} env 
 * @returns {Promise<Response|null>} Response if handled, null if not
 */
export async function handleDashboardRequest(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API 路由
    if (path.startsWith('/api/dashboard')) {
        // 继续到下面的 API 处理逻辑
    }
    // 静态资源
    else if (path.startsWith('/dashboard/assets/')) {
        return env.ASSETS.fetch(request);
    }
    // SPA 路由: 所有 /dashboard/* 路径返回 index.html
    else if (path.startsWith('/dashboard')) {
        const indexUrl = new URL(request.url);
        indexUrl.pathname = '/dashboard/index.html';
        return env.ASSETS.fetch(indexUrl.toString());
    }
    else {
        return null;
    }

    // --- API 处理逻辑 ---
    if (!path.startsWith('/api/dashboard')) {
        return null;
    }

    const method = request.method;

    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        // ===== 公开路由 =====
        const publicResult = await handlePublicRoutes(request, env);
        if (publicResult) return publicResult;

        // ===== 需要认证的路由 =====
        const authPayload = await authenticateRequest(request, env.DB);
        if (!authPayload) {
            return errorResponse('Unauthorized', 401);
        }

        // 用户路由
        const userResult = await handleUserRoutes(request, env, authPayload);
        if (userResult) return userResult;

        // 管理员路由
        const adminResult = await handleAdminRoutes(request, env, authPayload);
        if (adminResult) return adminResult;

        return errorResponse('Not Found', 404);

    } catch (err) {
        logError('[Dashboard]', err);
        return errorResponse(err.message, 500);
    }
}
