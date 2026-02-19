import { Buffer } from 'node:buffer';
import * as mmdb from 'mmdb-lib';

export function extractMmdbBuildEpochFromArrayBuffer(arrayBuffer) {
    try {
        const reader = new mmdb.Reader(Buffer.from(arrayBuffer));
        const buildDate = reader?.metadata?.buildEpoch;
        if (!(buildDate instanceof Date) || Number.isNaN(buildDate.getTime())) {
            return null;
        }
        return buildDate.getTime();
    } catch {
        return null;
    }
}
