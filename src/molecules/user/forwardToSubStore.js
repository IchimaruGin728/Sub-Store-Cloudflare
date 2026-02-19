/**
 * L3 - Molecule
 * UserDO：处理 Sub-Store HTTP 请求，并在成功下载时写入访问日志。
 */

import { errorResponse } from '../../atoms/http/httpAtoms.js';
import { flushDirtyGlobalUserData } from '../../atoms/user/flushDirtyGlobalUserData.js';
import { extractAvatarUrlFromUserDataString } from '../../atoms/user/extractAvatarUrlFromUserDataString.js';
import { selectUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';
import { upsertUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';
import { updateAvatarInIndexDo } from '../../atoms/cf/bindings.js';
import { runSubStoreHttpForUser } from '../../atoms/substore/runSubStoreHttpForUser.js';
import { appendAccessLogWithRetention } from '../../atoms/userSql/userSqlAtoms.js';

export async function forwardToSubStore({ request, env, state, storage, requestId, route }) {
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

    const httpEnv = { ...env, __saveUserData: (id) => saveUserData(id) };

    const resp = await runSubStoreHttpForUser({
        user,
        env: httpEnv,
        state,
        request,
        subStorePath: route.substore.subStorePath,
    });

    if (!resp) return errorResponse('Internal Server Error', 500);

    // 仅记录成功下载（200/304）
    if (route.downloadLogCandidate) {
        const st = resp.status ?? 0;
        if (st === 200 || st === 304) {
            appendAccessLogWithRetention(storage, { ...route.downloadLogCandidate, status: st });
        }
    }

    return resp;
}
