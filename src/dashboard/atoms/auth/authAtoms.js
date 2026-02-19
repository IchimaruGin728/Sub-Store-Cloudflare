import { SignJWT, jwtVerify } from 'jose';

export function getBearerTokenFromRequest(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice('Bearer '.length).trim() || null;
}

export function getJwtSecretKeyBytes(env) {
    const envSecret = env?.JWT_SECRET;
    const processSecret = typeof process !== 'undefined' ? process.env?.JWT_SECRET : undefined;
    const secret = envSecret || processSecret;
    if (!secret) {
        throw new Error('JWT_SECRET 未配置');
    }
    return new TextEncoder().encode(secret);
}

export async function signJwtToken(payload, expiryHours, env) {
    const secretKey = getJwtSecretKeyBytes(env);
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${expiryHours}h`)
        .sign(secretKey);
}

export async function verifyJwtTokenOrNull(token, env) {
    try {
        const secretKey = getJwtSecretKeyBytes(env);
        const { payload } = await jwtVerify(token, secretKey);
        return payload ?? null;
    } catch {
        return null;
    }
}
