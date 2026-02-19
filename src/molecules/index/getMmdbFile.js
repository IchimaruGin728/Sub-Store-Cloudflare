/**
 * L3 - Molecule
 * IndexDO：按名称返回 mmdb 文件（BLOB）。
 */

import { errorResponse } from '../../atoms/http/httpAtoms.js';
import { binaryResponse } from '../../atoms/http/httpAtoms.js';
import { selectMmdbFileByName } from '../../atoms/indexSql/indexSqlAtoms.js';

export async function getMmdbFile({ storage, route }) {
    const name = route?.name || '';
    if (!name) return errorResponse('Missing mmdb name', 400);

    const row = selectMmdbFileByName(storage, name);
    if (!row?.data) return errorResponse('Not Found', 404);

    const headers = {
        'Cache-Control': 'no-store',
    };
    if (row.etag) headers.ETag = row.etag;
    if (row.updatedAt) headers['X-MMDB-Updated-At'] = String(row.updatedAt);

    return binaryResponse(row.data, 200, headers);
}
