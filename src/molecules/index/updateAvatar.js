/**
 * L3 - Molecule
 * IndexDO：更新用户 avatar_url（UserDO 解析后回写）。
 */

import { jsonResponse, errorResponse } from '../../atoms/http/httpAtoms.js';
import { readJsonBody } from '../../atoms/http/httpAtoms.js';
import { updateAvatarUrl } from '../../atoms/indexSql/indexSqlAtoms.js';

export async function updateAvatar({ request, storage }) {
    const body = (await readJsonBody(request)) || {};
    const userId = parseInt(body?.userId, 10);
    const avatarUrl = String(body?.avatarUrl || '');
    if (!userId) return errorResponse('userId required', 400);

    updateAvatarUrl(storage, userId, avatarUrl, Date.now());
    return jsonResponse({ ok: true });
}
