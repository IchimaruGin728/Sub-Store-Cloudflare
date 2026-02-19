/**
 * L3 - Molecule
 * UserDO：删除当前用户的整段 data，并在需要时同步 avatarUrl。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { deleteUserStoreKey } from '../../atoms/userSql/userSqlAtoms.js';
import { selectUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';
import { updateAvatarInIndexDo } from '../../atoms/cf/bindings.js';
import { upsertUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';

export async function deleteUserDataString({ request, env, storage, requestId }) {
    deleteUserStoreKey(storage, 'user_data');

    const headerUserId = request.headers.get('X-User-Id');
    const userId = parseInt(headerUserId || '0', 10) || 0;
    if (userId) {
        const prev = selectUserStoreValue(storage, 'avatar_url') ?? '';
        if (prev !== '') {
            upsertUserStoreValue(storage, 'avatar_url', '', Date.now());
            await updateAvatarInIndexDo({ env, userId, avatarUrl: '', requestId });
        }
    }

    return jsonResponse({ ok: true });
}
