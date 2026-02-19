/**
 * L3 - Molecule
 * UserDO：写入当前用户的整段 data（字符串形式），并在需要时同步 avatarUrl 到 IndexDO。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { readJsonBody } from '../../atoms/http/httpAtoms.js';
import { upsertUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';
import { selectUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';
import { extractAvatarUrlFromUserDataString } from '../../atoms/user/extractAvatarUrlFromUserDataString.js';
import { updateAvatarInIndexDo } from '../../atoms/cf/bindings.js';

export async function putUserDataString({ request, env, storage, requestId }) {
    const body = (await readJsonBody(request)) || {};
    const dataString = JSON.stringify(body?.data ?? {});

    upsertUserStoreValue(storage, 'user_data', dataString, Date.now());

    // avatar 同步（UserDO -> IndexDO）
    const headerUserId = request.headers.get('X-User-Id');
    const userId = parseInt(headerUserId || '0', 10) || 0;
    if (userId) {
        const avatarUrl = extractAvatarUrlFromUserDataString(dataString);
        const prev = selectUserStoreValue(storage, 'avatar_url') ?? '';
        if (prev !== avatarUrl) {
            upsertUserStoreValue(storage, 'avatar_url', avatarUrl, Date.now());
            await updateAvatarInIndexDo({ env, userId, avatarUrl, requestId });
        }
    }

    return jsonResponse({ ok: true });
}
