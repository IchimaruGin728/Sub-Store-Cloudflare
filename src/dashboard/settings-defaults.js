/**
 * 系统设置默认值
 * 当数据库中没有对应的 key 时，使用这里的默认值
 */

export const defaultSettings = {
    // Sub-Store 前端 URL
    frontendUrl: 'https://sub-store.vercel.app/',
    // 登录 Token 过期时间（小时），默认 7 天
    tokenExpiryHours: 168,
};
