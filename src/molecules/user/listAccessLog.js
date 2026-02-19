/**
 * L3 - Molecule
 * UserDO：读取下载访问日志（分页）。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { selectAccessLogPage } from '../../atoms/userSql/userSqlAtoms.js';

export async function listAccessLog({ storage, route }) {
    const limit = Math.max(1, Math.min(200, route.limit || 50));
    const beforeId = route.beforeId || 0;

    const rows = selectAccessLogPage(storage, { limit, beforeId });
    const nextBeforeId = rows.length > 0 ? rows[rows.length - 1].id : null;
    return jsonResponse({ results: rows, nextBeforeId });
}
