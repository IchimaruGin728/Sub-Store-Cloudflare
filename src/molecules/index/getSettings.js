/**
 * L3 - Molecule
 * IndexDO：读取系统设置（补齐默认值并在缺失时回写）。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { selectSystemSettingsRow } from '../../atoms/indexSql/indexSqlAtoms.js';
import { upsertSystemSettingsRow } from '../../atoms/indexSql/indexSqlAtoms.js';
import { parseJsonObjectOrEmpty } from '../../atoms/json/parseJsonObjectOrEmpty.js';

export async function getSettings({ storage, mergeSettings }) {
    const row = selectSystemSettingsRow(storage);
    const dbSettings = parseJsonObjectOrEmpty(row?.settings || '{}');

    const { merged, needsSave } = mergeSettings({ dbSettings });
    if (needsSave) {
        upsertSystemSettingsRow(storage, JSON.stringify(merged), Date.now());
    }

    return jsonResponse(merged);
}
