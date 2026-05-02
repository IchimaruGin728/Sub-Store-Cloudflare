import { SignJWT, jwtVerify } from 'jose';

export function getBearerTokenFromRequest(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.slice('Bearer '.length).trim() || null;
}

async function readSecretStoreBinding(binding) {
    if (!binding || typeof binding.get !== 'function') {
        return null;
    }
    const value = await binding.get();
    return typeof value === 'string' && value ? value : null;
}

export async function getJwtSecretKeyBytes(env) {
    const secretStoreSecret = await readSecretStoreBinding(env?.JWT_SECRET_STORE);
    const envSecret = typeof env?.JWT_SECRET === 'string' ? env.JWT_SECRET : null;
    const processSecret = typeof process !== 'undefined' ? process.env?.JWT_SECRET : undefined;
    const secret = secretStoreSecret || envSecret || processSecret;
    if (!secret) {
        throw new Error('JWT_SECRET_STORE 或 JWT_SECRET 未配置');
    }
    return new TextEncoder().encode(secret);
}

export async function signJwtToken(payload, expiryHours, env) {
    const secretKey = await getJwtSecretKeyBytes(env);
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${expiryHours}h`)
        .sign(secretKey);
}

export async function verifyJwtTokenOrNull(token, env) {
    try {
        const secretKey = await getJwtSecretKeyBytes(env);
        const { payload } = await jwtVerify(token, secretKey);
        return payload ?? null;
    } catch {
        return null;
    }
}
