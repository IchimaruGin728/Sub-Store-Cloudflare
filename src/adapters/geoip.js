/**
 * Sub-Store GeoIP 适配器
 * 初期禁用，返回空结果
 */

import { debug } from '../utils/logger.js';

export class MMDB {
    constructor(options = {}) {
        // 初期禁用 GeoIP 功能
        debug('[MMDB] GeoIP disabled in Workers environment');
    }

    /**
     * 查询 IP 所属国家
     * @returns {undefined} 始终返回 undefined
     */
    geoip(ip) {
        return undefined;
    }

    /**
     * 查询 IP 所属 ASN 组织
     * @returns {undefined} 始终返回 undefined
     */
    ipaso(ip) {
        return undefined;
    }

    /**
     * 查询 IP 所属 ASN 号码
     * @returns {undefined} 始终返回 undefined
     */
    ipasn(ip) {
        return undefined;
    }
}
