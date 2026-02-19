/**
 * L3 - Molecule
 * Dashboard 公开 API（无需认证）
 * - 验证码
 * - 登录
 * - 公开设置
 */

import { jsonResponse, errorResponse } from '../atoms/http/httpAtoms.js';
import { signJwtToken } from '../atoms/auth/authAtoms.js';
import { hashPassword, verifyPassword } from '../atoms/crypto/password.js';
import { createCaptcha, verifyCaptcha } from './services/captchaService.js';
import { getUser, createUser } from './services/userService.js';
import { getSystemSettings } from './services/systemSettingsService.js';
import { countUsers } from '../atoms/userSql/userSqlAtoms.js';

export async function handleDashboardPublicApi({ request, env, io }) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const ctx = env.DB;

    // GET /api/dashboard/captcha
    if (path === '/api/dashboard/captcha' && method === 'GET') {
        const captcha = await createCaptcha(ctx);
        return jsonResponse(captcha);
    }

    // GET /api/dashboard/settings/public - 公开设置
    if (path === '/api/dashboard/settings/public' && method === 'GET') {
        const cached = await io.matchPublicSettingsCache({ request });
        if (cached) return cached;

        const settings = await getSystemSettings(ctx);
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
        await io.putPublicSettingsCache({ request, response });
        return response;
    }

    // POST /api/dashboard/auth/login
    if (path === '/api/dashboard/auth/login' && method === 'POST') {
        const body = await request.json();
        const { username, password, captchaId, captchaCode, turnstileToken } = body;

        const settings = await getSystemSettings(ctx);
        const captchaType = settings.captchaType || 'builtin';

        if (captchaType === 'turnstile') {
            const secretKey = settings.turnstileSecretKey;
            if (!secretKey) return errorResponse('人机验证未配置');
            if (!turnstileToken) return errorResponse('验证失败');
            const ip = request.headers.get('CF-Connecting-IP') || '';
            const valid = await io.verifyTurnstileToken({ token: turnstileToken, secretKey, ip });
            if (!valid) return errorResponse('人机验证失败');
        } else {
            const valid = await verifyCaptcha(ctx, captchaId, captchaCode);
            if (!valid) return errorResponse('验证码错误或已过期');
        }

        let user = await getUser(ctx, username);

        // First time init: if no users, create admin
        if (!user && username === 'admin') {
            const count = await countUsers(ctx);
            if (count === 0) {
                const hashedPassword = await hashPassword('admin');
                await createUser(ctx, 'admin', hashedPassword, 'admin');
                user = await getUser(ctx, 'admin');
            }
        }

        if (!user || !(await verifyPassword(password, user.password_hash))) {
            return errorResponse('用户名或密码错误', 401);
        }

        const mustChangePassword = user.username === 'admin'
            && await verifyPassword('admin', user.password_hash);

        const expiryHours = settings?.tokenExpiryHours
            ? parseInt(settings.tokenExpiryHours, 10)
            : 168; // 7 天（兼容 Sub-Store 默认）
        const token = await signJwtToken({
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

    return errorResponse('Not Found', 404);
}
