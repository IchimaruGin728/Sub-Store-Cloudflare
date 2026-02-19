/**
 * L3 - Molecule
 * 管理员安全策略：检测默认管理员密码，未修改则阻止除“读取个人信息/修改密码”之外的操作。
 */

import { errorResponse } from '../atoms/http/httpAtoms.js';
import { getUserById } from './services/userService.js';
import { verifyPassword } from '../atoms/crypto/password.js';

export async function enforceAdminPasswordChange({ request, env, authPayload }) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const currentUser = await getUserById(env.DB, authPayload.id);
    const mustChangePassword = currentUser ? await verifyPassword('admin', currentUser.password_hash) : false;

    const allowChangePassword = path === '/api/dashboard/user/password' && method === 'POST';
    const allowReadMe = path === '/api/dashboard/user/me' && method === 'GET';

    if (mustChangePassword && !(allowChangePassword || allowReadMe)) {
        return errorResponse('请先修改默认管理员密码', 403);
    }

    return null;
}
