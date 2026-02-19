/**
 * L4 Atom
 *
 * Ensure Surge-like GeoIP utilities exist:
 * - $utils.geoip(ip)
 * - $utils.ipasn(ip)
 * - $utils.ipaso(ip)
 */

import { ensureGeoDbLoaded } from './ensureGeoDbLoaded.js';
import { installSurgeUtilsGeoip } from './installSurgeUtilsGeoip.js';

export async function ensureSurgeGeoipInstalled(env) {
    const cache = await ensureGeoDbLoaded(env);
    installSurgeUtilsGeoip({
        countryReader: cache.countryReader,
        asnReader: cache.asnReader,
    });
}
