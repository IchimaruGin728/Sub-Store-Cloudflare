/**
 * L4 - Atom
 * 把 user.data（可能是 string/object/null）归一化为对象。
 */

export function normalizeUserDataToObject(userData) {
    if (!userData) return {};
    if (typeof userData === 'object') return userData;
    if (typeof userData !== 'string') return {};

    try {
        const obj = JSON.parse(userData || '{}');
        if (!obj || typeof obj !== 'object') return {};
        return obj;
    } catch (e) {
        return {};
    }
}

