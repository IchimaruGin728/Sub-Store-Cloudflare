/**
 * L3 - Molecule
 * IndexDO：更新系统设置（基于当前 settings 合并 patch 后写回）。
 */

import { jsonResponse } from '../../atoms/http/httpAtoms.js';
import { readJsonBody } from '../../atoms/http/httpAtoms.js';
import { selectSystemSettingsRow } from '../../atoms/indexSql/indexSqlAtoms.js';
import { upsertSystemSettingsRow } from '../../atoms/indexSql/indexSqlAtoms.js';
import { parseJsonObjectOrEmpty } from '../../atoms/json/parseJsonObjectOrEmpty.js';

export async function patchSettings({ request, storage, mergeSettings, mergePatch }) {
    const patch = (await readJsonBody(request)) || {};

    const row = selectSystemSettingsRow(storage);
    const dbSettings = parseJsonObjectOrEmpty(row?.settings || '{}');
    const { merged: current, needsSave } = mergeSettings({ dbSettings });
    if (needsSave) {
        upsertSystemSettingsRow(storage, JSON.stringify(current), Date.now());
    }

    const next = mergePatch({ current, patch });
    upsertSystemSettingsRow(storage, JSON.stringify(next), Date.now());

    return jsonResponse({ ok: true });
}
