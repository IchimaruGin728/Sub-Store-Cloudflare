/**
 * L3 - Molecule
 * UserDO：读取当前用户的整段 data（字符串形式）。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { selectUserStoreValue } from '../../atoms/userSql/userSqlAtoms.js';

export async function getUserDataString({ storage }) {
    const value = selectUserStoreValue(storage, 'user_data');
    return jsonResponse({ data: value ?? '{}' });
}
