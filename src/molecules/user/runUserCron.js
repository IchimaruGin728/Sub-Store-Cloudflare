/**
 * L3 - Molecule
 * UserDO：执行单个用户的 cron（触发 Sub-Store /api/utils/refresh）。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { flushDirtyGlobalUserData } from '../../atoms/user/flushDirtyGlobalUserData.js';
import { extractAvatarUrlFromUserDataString } from '../../atoms/user/extractAvatarUrlFromUserDataString.js';
import { selectUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';
import { upsertUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';
import { updateAvatarInIndexDo } from '../../atoms/cf/bindings.js';
import { runSubStoreCronForUser } from '../../atoms/substore/runSubStoreCronForUser.js';

export async function runUserCron({ request, env, state, storage, requestId }) {
    const headerUserId = request.headers.get('X-User-Id');
    const userId = parseInt(headerUserId || '0', 10) || 0;

    const username = request.headers.get('X-Username') || `user-${userId || 'unknown'}`;
    const role = request.headers.get('X-Role') || 'user';
    const userPath = request.headers.get('X-User-Path') || '';
    const userData = selectUserStoreValue(storage, 'user_data') ?? '{}';
    const user = { id: userId, username, role, path: userPath, data: userData };

    const saveUserData = async (id) => {
        const saved = flushDirtyGlobalUserData(storage);
        if (!saved) return;
        const avatarUrl = extractAvatarUrlFromUserDataString(saved);
        const prev = selectUserStoreValue(storage, 'avatar_url') ?? '';
        if (prev !== avatarUrl) {
            upsertUserStoreValue(storage, 'avatar_url', avatarUrl, Date.now());
            if (id) await updateAvatarInIndexDo({ env, userId: id, avatarUrl, requestId });
        }
    };

    const cronEnv = { ...env, __saveUserData: (id) => saveUserData(id) };
    await runSubStoreCronForUser({ user, env: cronEnv });
    return jsonResponse({ ok: true });
}
