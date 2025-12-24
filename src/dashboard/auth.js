import { SignJWT, jwtVerify } from 'jose';
import { getUserById } from './user.js';
import { getSystemSettings } from './settings.js';

function getSecretKey(env) {
    const envSecret = env?.JWT_SECRET;
    const processSecret = typeof process !== 'undefined' ? process.env?.JWT_SECRET : undefined;
    const secret = envSecret || processSecret;
    if (!secret) {
        throw new Error('JWT_SECRET 未配置');
    }
    return new TextEncoder().encode(secret);
}

// 默认 Token 有效期（小时）
const DEFAULT_TOKEN_EXPIRY_HOURS = 168; // 7 天

/**
 * 生成 JWT Token
 * @param {object} payload - 包含 id, username, role, tokenVersion
 * @param {number} expiryHours - 过期时间（小时）
 * @returns {Promise<string>} token
 */
export async function signToken(payload, expiryHours = DEFAULT_TOKEN_EXPIRY_HOURS, env) {
    const secretKey = getSecretKey(env);
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${expiryHours}h`)
        .sign(secretKey);
}

/**
 * 验证 JWT Token
 * @param {string} token 
 * @returns {Promise<object|null>} payload
 */
export async function verifyToken(token, env) {
    try {
        const secretKey = getSecretKey(env);
        const { payload } = await jwtVerify(token, secretKey);
        return payload;
    } catch (err) {
        return null;
    }
}

/**
 * 验证中间件逻辑（包含 Token 版本检查）
 * @param {Request} request 
 * @param {DB} db - 数据库实例，用于验证 tokenVersion
 * @returns {Promise<object|null>} user payload
 */
export async function authenticateRequest(request, db, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];
    const payload = await verifyToken(token, env);

    if (!payload) {
        return null;
    }

    // 验证 Token 版本（改密码后旧 Token 失效）
    if (db && payload.id && payload.tokenVersion !== undefined) {
        const user = await getUserById(db, payload.id);
        if (!user || user.token_version !== payload.tokenVersion) {
            return null; // Token 已失效
        }
    }

    return payload;
}

/**
 * 获取系统配置的 Token 过期时间
 * @param {DB} db 
 * @returns {Promise<number>} 过期时间（小时）
 */
export async function getTokenExpiryHours(db) {
    const settings = await getSystemSettings(db);
    const expiry = settings?.tokenExpiryHours;
    return expiry ? parseInt(expiry, 10) : DEFAULT_TOKEN_EXPIRY_HOURS;
}
