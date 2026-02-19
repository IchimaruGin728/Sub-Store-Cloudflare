/**
 * L3 - Molecule
 * Dashboard 鉴权（含 tokenVersion 校验）。
 */

import { getBearerTokenFromRequest } from '../atoms/auth/authAtoms.js';
import { verifyJwtTokenOrNull } from '../atoms/auth/authAtoms.js';
import { getUserTokenVersionById } from '../atoms/userSql/userSqlAtoms.js';

export async function authenticateDashboardRequest({ request, ctx, env }) {
    const token = getBearerTokenFromRequest(request);
    if (!token) return null;

    const payload = await verifyJwtTokenOrNull(token, env);
    if (!payload) return null;

    // 验证 Token 版本（改密码后旧 Token 失效）
    if (ctx && payload.id && payload.tokenVersion !== undefined) {
        const tokenVersion = getUserTokenVersionById(ctx, payload.id);
        if (tokenVersion === null) return null;
        if (tokenVersion !== payload.tokenVersion) return null;
    }

    return payload;
}

