/**
 * L3 - Molecule
 * IndexDO：按 path 反查用户。
 */

import { jsonResponse, errorResponse } from '../../atoms/http/httpAtoms.js';
import { selectUserByPath } from '../../atoms/indexSql/indexSqlAtoms.js';

export async function getUserByPath({ storage, route }) {
    const userPath = route.userPath || '';
    if (!userPath) return errorResponse('path required', 400);

    const row = selectUserByPath(storage, userPath);
    if (!row) return errorResponse('Not Found', 404);
    return jsonResponse(row);
}
