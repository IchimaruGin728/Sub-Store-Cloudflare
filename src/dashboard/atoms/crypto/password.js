/**
 * 密码哈希工具
 * 使用 Web Crypto API 实现安全的密码存储。
 */

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_BYTES = 32;
const PBKDF2_SALT_BYTES = 16;

/**
 * 生成随机盐值
 * @param {number} length - 盐值长度（字节）
 * @returns {string} - Base64 编码的盐值
 */
function generateSalt(length = PBKDF2_SALT_BYTES) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return bytesToBase64(array);
}

/**
 * 将字符串转换为 ArrayBuffer
 * @param {string} str 
 * @returns {ArrayBuffer}
 */
function stringToArrayBuffer(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str);
}

/**
 * 将 ArrayBuffer 转换为十六进制字符串
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
function arrayBufferToHex(buffer) {
    const byteArray = new Uint8Array(buffer);
    return Array.from(byteArray, byte => byte.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

async function pbkdf2(password, saltBytes, iterations) {
    const key = await crypto.subtle.importKey(
        'raw',
        stringToArrayBuffer(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBytes,
            iterations,
            hash: 'SHA-256',
        },
        key,
        PBKDF2_HASH_BYTES * 8
    );

    return new Uint8Array(derivedBits);
}

/**
 * 哈希密码
 * 格式: $pbkdf2$iterations$salt$hash
 * @param {string} password - 明文密码
 * @returns {Promise<string>} - 格式化的哈希字符串
 */
export async function hashPassword(password) {
    const salt = generateSalt();
    const saltBytes = base64ToBytes(salt);
    const hashBytes = await pbkdf2(password, saltBytes, PBKDF2_ITERATIONS);
    const hash = bytesToBase64(hashBytes);
    return `$pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

/**
 * 验证密码
 * @param {string} password - 明文密码
 * @param {string} storedHash - 存储的哈希字符串
 * @returns {Promise<boolean>} - 是否匹配
 */
export async function verifyPassword(password, storedHash) {
    if (!storedHash) {
        return false;
    }

    const parts = storedHash.split('$');
    if (parts.length < 4) {
        return false;
    }

    const [, algorithm, ...rest] = parts;

    if (algorithm === 'pbkdf2') {
        const [iterationsStr, salt, hash] = rest;
        const iterations = parseInt(iterationsStr, 10);
        if (!iterations || !salt || !hash) {
            return false;
        }
        const saltBytes = base64ToBytes(salt);
        const computedHashBytes = await pbkdf2(password, saltBytes, iterations);
        const storedHashBytes = base64ToBytes(hash);
        return constantTimeEqual(computedHashBytes, storedHashBytes);
    }

    if (algorithm === 'sha256') {
        const [salt, hash] = rest;
        if (!salt || !hash) {
            return false;
        }
        const saltedPassword = salt + password;
        const hashBuffer = await crypto.subtle.digest('SHA-256', stringToArrayBuffer(saltedPassword));
        const computedHash = arrayBufferToHex(hashBuffer);
        return computedHash === hash;
    }

    return false;
}
