export function createSqliteDb(sql, options = {}) {
    const { userDataStore } = options;

    const db = {
        userDataStore,
        async one(query, ...args) {
            const cursor = sql.exec(query, ...args);
            const result = cursor.next();
            return result.done ? null : (result.value ?? null);
        },
        async all(query, ...args) {
            return sql.exec(query, ...args).toArray();
        },
        async run(query, ...args) {
            sql.exec(query, ...args);
            return { success: true };
        },
        async batch(statements) {
            for (const stmt of statements) {
                if (!stmt) continue;
                if (Array.isArray(stmt)) {
                    const [query, ...args] = stmt;
                    sql.exec(query, ...args);
                } else if (typeof stmt === 'object' && typeof stmt.query === 'string') {
                    sql.exec(stmt.query, ...(stmt.args || []));
                }
            }
            return { success: true };
        },
    };

    return db;
}

