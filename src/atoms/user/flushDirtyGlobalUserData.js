/**
 * L4 - Atom
 * 把 globalThis.__user_data__ 持久化到 UserDO 的 user_store（仅在 dirty 时）。
 */

export function flushDirtyGlobalUserData(storage) {
    if (globalThis.__user_data_dirty__ && globalThis.__user_data__) {
        const dataString = JSON.stringify(globalThis.__user_data__);
        storage.sql`
            INSERT OR REPLACE INTO user_store (key, value, updated_at)
            VALUES (${'user_data'}, ${dataString}, ${Date.now()});
        `;
        globalThis.__user_data_dirty__ = false;
        globalThis.__user_data__ = null;
        return dataString;
    }
    return null;
}
