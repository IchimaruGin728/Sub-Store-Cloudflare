/**
 * L3 - Molecule
 * IndexDO：写入 mmdb 文件（由 Worker 上传）。
 */

import { errorResponse, jsonResponse } from '../../atoms/http/httpAtoms.js';
import { upsertMmdbFile } from '../../atoms/indexSql/indexSqlAtoms.js';

const ALLOWED_NAMES = new Set(['Country.mmdb', 'Country-asn.mmdb']);

export async function putMmdbFile({ request, storage, route }) {
    const name = route?.name || '';
    if (!ALLOWED_NAMES.has(name)) {
        return errorResponse('Invalid mmdb name', 400);
    }

    // Optional versioning from uploader
    const etag = request.headers.get('ETag') || request.headers.get('X-MMDB-ETAG') || '';
    const sourceUrl = request.headers.get('X-MMDB-SOURCE-URL') || '';
    const buildEpochRaw = request.headers.get('X-MMDB-BUILD-EPOCH') || '';
    const buildEpoch = Number.parseInt(buildEpochRaw, 10);

    let ab;
    try {
        ab = await request.arrayBuffer();
    } catch (e) {
        return errorResponse(`Invalid body: ${e?.message || e}`, 400);
    }
    if (!ab || ab.byteLength === 0) {
        return errorResponse('Empty body', 400);
    }
    // Basic guardrail: avoid accidental huge uploads
    if (ab.byteLength > 64 * 1024 * 1024) {
        return errorResponse('MMDB too large', 413);
    }

    const now = Date.now();
    upsertMmdbFile(storage, {
        name,
        etag,
        sourceUrl,
        buildEpoch: Number.isFinite(buildEpoch) && buildEpoch > 0 ? buildEpoch : null,
        updatedAt: now,
        data: new Uint8Array(ab),
        chunkSize: 256 * 1024,
    });

    return jsonResponse({ success: true, name, etag, size: ab.byteLength, updatedAt: now });
}
