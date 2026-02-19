/**
 * L4 Atom
 *
 * Install Surge-like $utils.geoip/ipasn/ipaso functions.
 *
 * Surge docs: https://manual.nssurge.com/scripting/common.html
 */

import { debug, warn } from '../../../utils/logger.js';

function normalizeIpInput(raw) {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // [IPv6]:port
    if (s.startsWith('[')) {
        const idx = s.indexOf(']');
        if (idx > 1) return s.slice(1, idx);
    }

    // IPv4:port
    const m4 = s.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
    if (m4) return m4[1];

    return s;
}

function ensureUtilsObject() {
    if (!globalThis.$utils || typeof globalThis.$utils !== 'object') {
        globalThis.$utils = {};
    }
    return globalThis.$utils;
}

export function installSurgeUtilsGeoip({ countryReader, asnReader }) {
    const $utils = ensureUtilsObject();

    const requestId = globalThis.__current_request_id__ || 'unknown';
    debug(
        `[GeoIP] [${requestId}] install $utils geoip: countryReader=${!!countryReader} asnReader=${!!asnReader}`,
    );

    // Debug rate limit: avoid spamming on large proxy lists.
    if (!globalThis.__surge_geoip_debug_counts__) {
        globalThis.__surge_geoip_debug_counts__ = new Map();
    }
    const counts = globalThis.__surge_geoip_debug_counts__;
    const bump = (method) => {
        const key = `${requestId}:${method}`;
        const n = (counts.get(key) || 0) + 1;
        counts.set(key, n);
        // simple cap to keep memory bounded
        if (counts.size > 200) counts.clear();
        return n;
    };

    $utils.geoip = (ip) => {
        const normalized = normalizeIpInput(ip);
        if (!normalized || !countryReader) return undefined;
        const res = countryReader.get(normalized);
        // Country DB may provide `country` or only `registered_country`
        const out = res?.country?.iso_code || res?.registered_country?.iso_code;
        const n = bump('geoip');
        if (n <= 5) {
            debug(`[GeoIP] [${requestId}] $utils.geoip(${normalized}) -> ${out}`);
        }
        return out;
    };

    $utils.ipasn = (ip) => {
        const normalized = normalizeIpInput(ip);
        if (!normalized || !asnReader) return undefined;
        const res = asnReader.get(normalized);
        const out = res?.autonomous_system_number;
        const n = bump('ipasn');
        if (n <= 5) {
            debug(`[GeoIP] [${requestId}] $utils.ipasn(${normalized}) -> ${out}`);
        }
        return out;
    };

    $utils.ipaso = (ip) => {
        const normalized = normalizeIpInput(ip);
        if (!normalized || !asnReader) return undefined;
        const res = asnReader.get(normalized);
        const out = res?.autonomous_system_organization;
        const n = bump('ipaso');
        if (n <= 5) {
            debug(`[GeoIP] [${requestId}] $utils.ipaso(${normalized}) -> ${out}`);
        }
        return out;
    };

    // Best-effort hint for scripts (log once per isolate)
    if ((!countryReader || !asnReader) && !globalThis.__surge_geoip_warned__) {
        globalThis.__surge_geoip_warned__ = true;
        warn('[GeoIP] MMDB readers not ready; $utils.geoip/ipasn/ipaso will return undefined');
    }
}
