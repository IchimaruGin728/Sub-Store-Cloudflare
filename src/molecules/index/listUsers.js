/**
 * L3 - Molecule
 * IndexDO：分页列出用户。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { selectUsersAfterId } from '../../atoms/indexSql/indexSqlAtoms.js';

export async function listUsers({ storage, route }) {
    const afterId = route.afterId || 0;
    const limit = Math.min(1000, Math.max(1, route.limit || 200));
    const results = selectUsersAfterId(storage, afterId, limit);
    return jsonResponse({ results });
}
