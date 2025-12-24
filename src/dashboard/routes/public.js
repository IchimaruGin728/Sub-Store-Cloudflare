/**
 * 公开路由 - 无需认证
 * - 验证码
 * - 登录
 * - 公开设置
 */
import { jsonResponse, errorResponse } from '../utils/response.js';
import { signToken, getTokenExpiryHours } from '../auth.js';
import { hashPassword, verifyPassword } from '../password.js';
import { createCaptcha, verifyCaptcha } from '../captcha.js';
import { getUser, createUser } from '../user.js';
import { getSystemSettings } from '../settings.js';
import { debug, error as logError } from '../../utils/logger.js';
import { countUsers } from '../repos/userRepo.js';

/**
 * 验证 Cloudflare Turnstile token
 */
async function verifyTurnstile(token, secretKey, ip) {
    debug('[Turnstile] Verifying with secretKey length:', secretKey.length, 'token length:', token?.length);
    try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}&remoteip=${encodeURIComponent(ip)}`
        });
        const data = await res.json();
        debug('[Turnstile] Verify result:', JSON.stringify(data));
        return data.success === true;
    } catch (e) {
        logError('[Turnstile] Verification error:', e);
        return false;
    }
}

/**
 * 处理公开路由
 * @returns {Response|null} 如果匹配返回 Response，否则返回 null
 */
export async function handlePublicRoutes(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const db = env.DB;

    // GET /api/dashboard/captcha
    if (path === '/api/dashboard/captcha' && method === 'GET') {
        const captcha = await createCaptcha(db);
        return jsonResponse(captcha);
    }

    // GET /api/dashboard/settings/public - 公开设置
    if (path === '/api/dashboard/settings/public' && method === 'GET') {
        const cache = caches.default;
        const cacheKey = new Request(request.url, { method: 'GET' });
        const cached = await cache.match(cacheKey);
        if (cached) {
            return cached;
        }

        const settings = await getSystemSettings(db);
        const captchaType = settings.captchaType || 'builtin';
        const turnstileSiteKey = captchaType === 'turnstile'
            ? settings.turnstileSiteKey
            : '';
        const response = jsonResponse({
            frontendUrl: settings.frontendUrl,
            captchaType,
            turnstileSiteKey,
            passwordMinLength: settings.passwordMinLength,
        });
        response.headers.set('Cache-Control', 'public, max-age=60');
        await cache.put(cacheKey, response.clone());
        return response;
    }

    // POST /api/dashboard/auth/login
    if (path === '/api/dashboard/auth/login' && method === 'POST') {
        const body = await request.json();
        const { username, password, captchaId, captchaCode, turnstileToken } = body;

        // 根据配置选择验证方式
        const settings = await getSystemSettings(db);
        let captchaType = settings.captchaType || 'builtin';

        if (captchaType === 'turnstile') {
            // Turnstile 验证
            const secretKey = settings.turnstileSecretKey;
            if (!secretKey) {
                return errorResponse('人机验证未配置');
            }
            if (!turnstileToken) {
                return errorResponse('验证失败');
            }
            const ip = request.headers.get('CF-Connecting-IP') || '';
            const valid = await verifyTurnstile(turnstileToken, secretKey, ip);
            if (!valid) {
                return errorResponse('人机验证失败');
            }
        } else {
            // 内置验证码
            const valid = await verifyCaptcha(db, captchaId, captchaCode);
            if (!valid) {
                return errorResponse('验证码错误或已过期');
            }
        }

        let user = await getUser(db, username);

        // First time init: if no users, create admin
        if (!user && username === 'admin') {
            const count = await countUsers(db);
            if (count === 0) {
                const hashedPassword = await hashPassword('admin');
                await createUser(db, 'admin', hashedPassword, 'admin');
                user = await getUser(db, 'admin');
            }
        }

        if (!user || !(await verifyPassword(password, user.password_hash))) {
            return errorResponse('用户名或密码错误', 401);
        }

        const mustChangePassword = user.username === 'admin'
            && await verifyPassword('admin', user.password_hash);

        // 获取可配置的 Token 过期时间
        const expiryHours = await getTokenExpiryHours(db);
        const token = await signToken({
            id: user.id,
            username: user.username,
            role: user.role,
            tokenVersion: user.token_version || 0
        }, expiryHours, env);
        const frontendUrl = settings.frontendUrl;
        return jsonResponse({
            token,
            role: user.role,
            path: user.path,
            frontendUrl,
            mustChangePassword,
        });
    }

    return null;
}
