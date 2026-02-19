/**
 * L4 - Atom
 * 从 userDataString（整段 JSON）中提取 avatarUrl。
 */

export function extractAvatarUrlFromUserDataString(userDataString) {
    try {
        const userDataObj = JSON.parse(userDataString || '{}');
        const subStoreStr = userDataObj?.['sub-store'];
        if (!subStoreStr) return '';
        const subStoreData = JSON.parse(subStoreStr);
        return subStoreData?.settings?.avatarUrl || '';
    } catch {
        return '';
    }
}

