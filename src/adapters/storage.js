/**
 * Sub-Store D1 存储适配器
 * 实现与 $persistentStore 兼容的同步接口
 */

import { debug, info, error } from '../utils/logger.js';

// 全局缓存（Worker 实例级别）
const globalCache = new Map();
let lastCacheUpdateTime = 0;

export class D1Storage {
    constructor(db) {
        this.db = db;
        // 本次请求的写入队列
        this.pendingWrites = new Map();
    }

    /**
     * 请求开始时预加载数据
     * 策略：检查 D1 中最新的 updated_at，如果比本地缓存新则全量重载
     */
    async preload() {
        try {
            // 1. 检查数据库最新版本
            // 兼容性：如果表为空，v 为 null，此时视为 0
            const { results: statusResult } = await this.db.prepare('SELECT MAX(updated_at) as v FROM sub_store_data').all();
            const lastDbUpdate = statusResult[0]?.v || 0;

            // 2. 比较版本，决定是否重载
            if (lastDbUpdate > lastCacheUpdateTime || globalCache.size === 0) {
                if (lastCacheUpdateTime > 0) {
                    debug(`[D1Storage] 检测到数据变更 (DB: ${lastDbUpdate} > Cache: ${lastCacheUpdateTime})，重新加载...`);
                } else {
                    debug(`[D1Storage] 首次加载数据...`);
                }

                const { results } = await this.db.prepare('SELECT key, value, updated_at FROM sub_store_data').all();

                globalCache.clear();
                for (const row of results) {
                    globalCache.set(row.key, row.value);
                }

                // 更新本地缓存时间戳
                // 注意：这里使用 DB 返回的时间还是这次加载的时间？
                // 应该使用 DB 的时间，但为了避免时钟偏差，取 max(lastDbUpdate, now) ?
                // 简单点：直接信任 DB 的 MAX(updated_at) 为当前版本
                lastCacheUpdateTime = lastDbUpdate;

                debug(`[D1Storage] 已加载 ${results.length} 条数据，版本: ${lastCacheUpdateTime}`);
            } else {
                debug(`[D1Storage] 缓存已是最新 (版本: ${lastCacheUpdateTime})，跳过加载`);
            }
        } catch (e) {
            debug(`[D1Storage] 预加载失败（如果是首次运行可忽略）: ${e.message}`);
        }
    }

    /**
     * 同步读取（从全局缓存）
     */
    read(key) {
        const value = globalCache.get(key);
        return value ?? null;
    }

    /**
     * 同步写入（写入全局缓存，标记待持久化）
     */
    write(data, key) {
        debug(`[D1Storage] 写入 key="${key}" 数据长度=${data?.length || 0}`);
        // 立即更新全局缓存，保证同一请求后续读取（以及同一实例后续请求）能读到最新值
        globalCache.set(key, data);
        this.pendingWrites.set(key, data);
        return true;
    }

    /**
     * 同步删除
     */
    delete(key) {
        debug(`[D1Storage] 删除 key="${key}"`);
        globalCache.delete(key);
        this.pendingWrites.set(key, null);
        return true;
    }

    /**
     * 请求结束时批量持久化到 D1
     */
    async flush() {
        debug(`[D1Storage] 开始持久化，待写入数量=${this.pendingWrites.size}`);

        if (this.pendingWrites.size === 0) {
            return;
        }

        const now = Date.now();
        const batch = [];

        for (const [key, value] of this.pendingWrites) {
            if (value === null) {
                batch.push(
                    this.db.prepare('DELETE FROM sub_store_data WHERE key = ?').bind(key)
                );
                debug(`[D1Storage] 队列: 删除 key="${key}"`);
            } else {
                batch.push(
                    this.db
                        .prepare(
                            'INSERT OR REPLACE INTO sub_store_data (key, value, updated_at) VALUES (?, ?, ?)'
                        )
                        .bind(key, value, now)
                );
                debug(`[D1Storage] 队列: 更新 key="${key}" 数据长度=${value?.length || 0}`);
            }
        }

        try {
            await this.db.batch(batch);
            info(`[D1Storage] 成功持久化 ${batch.length} 条操作`);
            // 更新本地缓存版本，避免下一请求无效重载
            if (now > lastCacheUpdateTime) {
                lastCacheUpdateTime = now;
            }
        } catch (e) {
            error(`[D1Storage] 持久化错误: ${e.message}`);
            error(`[D1Storage] 错误堆栈: ${e.stack}`);
        }

        this.pendingWrites.clear();
    }

    /**
     * 获取最后一次缓存更新的时间戳
     */
    getLastCacheUpdate() {
        return lastCacheUpdateTime;
    }
}

/**
 * 创建 Surge 风格的 $persistentStore 适配器
 */
export function createPersistentStore(storage) {
    return {
        read: (key) => storage.read(key),
        write: (data, key) => storage.write(data, key),
    };
}
