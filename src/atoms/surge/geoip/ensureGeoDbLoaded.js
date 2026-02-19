/**
 * L4 Atom
 *
 * Ensure GeoIP MMDB readers are loaded (once per isolate).
 * Data source: IndexDO (Country.mmdb / Country-asn.mmdb)
 */

import { Buffer } from 'node:buffer';
import * as mmdb from 'mmdb-lib';
import { debug, warn, error as logError } from '../../../utils/logger.js';
import { getMmdbFileFromIndexDo } from '../../cf/bindings.js';

function getGlobalCache() {
    if (!globalThis.__surge_geoip_cache__) {
        globalThis.__surge_geoip_cache__ = {
            readyPromise: null,
            countryReader: null,
            asnReader: null,
            loggedMissing: false,
        };
    }
    return globalThis.__surge_geoip_cache__;
}

function toBufferFromArrayBuffer(ab) {
    return Buffer.from(ab);
}

export async function ensureGeoDbLoaded(env) {
    const cache = getGlobalCache();
    if (cache.countryReader && cache.asnReader) return cache;
    if (cache.readyPromise) {
        await cache.readyPromise;
        return cache;
    }

    cache.readyPromise = (async () => {
        try {
            const requestId = globalThis.__current_request_id__ || 'unknown';
            debug(`[GeoIP] [${requestId}] loading mmdb from IndexDO ...`);

            const [countryFile, asnFile] = await Promise.all([
                getMmdbFileFromIndexDo({ env, name: 'Country.mmdb', requestId }),
                getMmdbFileFromIndexDo({ env, name: 'Country-asn.mmdb', requestId }),
            ]);

            debug(
                `[GeoIP] [${requestId}] IndexDO get Country.mmdb: ok=${!!countryFile?.ok} status=${countryFile?.status ?? 'n/a'} size=${countryFile?.arrayBuffer?.byteLength ?? 0}`,
            );
            debug(
                `[GeoIP] [${requestId}] IndexDO get Country-asn.mmdb: ok=${!!asnFile?.ok} status=${asnFile?.status ?? 'n/a'} size=${asnFile?.arrayBuffer?.byteLength ?? 0}`,
            );

            if (!countryFile?.arrayBuffer || !asnFile?.arrayBuffer) {
                if (!cache.loggedMissing) {
                    cache.loggedMissing = true;
                    warn('[GeoIP] mmdb not found in IndexDO; $utils.geoip/ipasn/ipaso will return undefined');
                }
                return;
            }

            const countryBuf = toBufferFromArrayBuffer(countryFile.arrayBuffer);
            const asnBuf = toBufferFromArrayBuffer(asnFile.arrayBuffer);

            cache.countryReader = new mmdb.Reader(countryBuf);
            cache.asnReader = new mmdb.Reader(asnBuf);

            debug(`[GeoIP] [${requestId}] mmdb readers initialized`);
        } catch (e) {
            if (!cache.loggedMissing) {
                cache.loggedMissing = true;
                logError('[GeoIP] failed to load MMDB from IndexDO:', e?.message || e);
                logError('[GeoIP] expected mmdb in IndexDO: Country.mmdb, Country-asn.mmdb');
            }
        }
    })();

    await cache.readyPromise;
    return cache;
}
