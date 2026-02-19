/**
 * L3 - Molecule
 * IndexDO：返回 mmdb 文件元信息（供 Worker/UserDO 判断是否已缓存）。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { selectMmdbFilesMeta } from '../../atoms/indexSql/indexSqlAtoms.js';

export async function getMmdbMeta({ storage }) {
    const rows = selectMmdbFilesMeta(storage) || [];
    return jsonResponse({ files: rows });
}
