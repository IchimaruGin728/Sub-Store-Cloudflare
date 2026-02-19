/**
 * L4 - Atom
 * 安全解析 JSON 对象：失败则返回空对象。
 */

export function parseJsonObjectOrEmpty(jsonString) {
    try {
        const obj = JSON.parse(jsonString || '{}');
        if (!obj || typeof obj !== 'object') return {};
        return obj;
    } catch {
        return {};
    }
}

