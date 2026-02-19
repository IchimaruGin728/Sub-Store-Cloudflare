/**
 * L4 - Atom
 * 去掉第一个 path segment（用于把 /{userPath}/xxx 转成 /xxx）。
 */

export function stripFirstPathSegment(pathname) {
    const segments = String(pathname || '').split('/').filter(Boolean);
    return '/' + segments.slice(1).join('/');
}

