import { SignJWT, jwtVerify } from 'jose';

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET || 'default-secret-key-change-me');

/**
 * 生成 JWT Token
 * @param {object} payload 
 * @returns {Promise<string>} token
 */
export async function signToken(payload) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('7d')
        .sign(SECRET_KEY);
}

/**
 * 验证 JWT Token
 * @param {string} token 
 * @returns {Promise<object|null>} payload
 */
export async function verifyToken(token) {
    try {
        const { payload } = await jwtVerify(token, SECRET_KEY);
        return payload;
    } catch (err) {
        return null;
    }
}

/**
 * 验证中间件逻辑
 * @param {Request} request 
 * @returns {Promise<object|null>} user payload
 */
export async function authenticateRequest(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];
    return await verifyToken(token);
}
