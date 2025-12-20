/**
 * SVG 验证码生成器
 * 使用 D1 数据库存储，支持分布式环境
 */
import { error as logError } from '../utils/logger.js';

// 验证码配置
const CAPTCHA_LENGTH = 4;
const CAPTCHA_EXPIRES = 5 * 60 * 1000; // 5分钟过期
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去除容易混淆的字符

/**
 * 生成随机字符串
 */
function generateCode(length = CAPTCHA_LENGTH) {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    return code;
}

/**
 * 生成随机颜色
 */
function randomColor(min = 0, max = 150) {
    const r = Math.floor(Math.random() * (max - min) + min);
    const g = Math.floor(Math.random() * (max - min) + min);
    const b = Math.floor(Math.random() * (max - min) + min);
    return `rgb(${r},${g},${b})`;
}

/**
 * 生成 SVG 验证码图片
 */
function generateSVG(code) {
    const width = 120;
    const height = 40;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;

    // 背景
    svg += `<rect width="100%" height="100%" fill="#f8fafc"/>`;

    // 干扰线
    for (let i = 0; i < 4; i++) {
        const x1 = Math.random() * width;
        const y1 = Math.random() * height;
        const x2 = Math.random() * width;
        const y2 = Math.random() * height;
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${randomColor(150, 200)}" stroke-width="1"/>`;
    }

    // 干扰点
    for (let i = 0; i < 30; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        svg += `<circle cx="${x}" cy="${y}" r="1" fill="${randomColor(150, 200)}"/>`;
    }

    // 绘制字符
    const charWidth = width / (code.length + 1);
    for (let i = 0; i < code.length; i++) {
        const x = charWidth * (i + 0.5);
        const y = height / 2 + 5;
        const rotate = (Math.random() - 0.5) * 30;
        const fontSize = 18 + Math.random() * 6;
        svg += `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="bold" fill="${randomColor()}" transform="rotate(${rotate}, ${x}, ${y})">${code[i]}</text>`;
    }

    svg += '</svg>';
    return svg;
}

/**
 * 生成验证码 ID
 */
function generateCaptchaId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 清理过期验证码
 */
async function cleanExpired(db) {
    try {
        await db.prepare('DELETE FROM captchas WHERE expires_at < ?').bind(Date.now()).run();
    } catch (e) {
        // 忽略清理错误
    }
}

/**
 * 创建新验证码
 * @param {D1Database} db - D1 数据库实例
 * @returns {Promise<{ id: string, svg: string }>}
 */
export async function createCaptcha(db) {
    // 清理过期验证码
    await cleanExpired(db);

    const code = generateCode();
    const id = generateCaptchaId();
    const svg = generateSVG(code);
    const expiresAt = Date.now() + CAPTCHA_EXPIRES;

    await db.prepare(
        'INSERT INTO captchas (id, code, attempts, expires_at) VALUES (?, ?, 0, ?)'
    ).bind(id, code.toUpperCase(), expiresAt).run();

    return { id, svg };
}

/**
 * 验证验证码
 * @param {D1Database} db - D1 数据库实例
 * @param {string} id 验证码 ID
 * @param {string} input 用户输入
 * @returns {Promise<boolean>}
 */
export async function verifyCaptcha(db, id, input) {
    if (!id || !input) return false;

    try {
        const result = await db.prepare(
            'SELECT code, attempts, expires_at FROM captchas WHERE id = ?'
        ).bind(id).first();

        if (!result) return false;

        // 检查是否过期
        if (Date.now() > result.expires_at) {
            await db.prepare('DELETE FROM captchas WHERE id = ?').bind(id).run();
            return false;
        }

        // 限制尝试次数
        if (result.attempts >= 3) {
            await db.prepare('DELETE FROM captchas WHERE id = ?').bind(id).run();
            return false;
        }

        // 更新尝试次数
        await db.prepare(
            'UPDATE captchas SET attempts = attempts + 1 WHERE id = ?'
        ).bind(id).run();

        // 验证（不区分大小写）
        const isValid = result.code === input.toUpperCase();

        // 验证成功后删除，防止重复使用
        if (isValid) {
            await db.prepare('DELETE FROM captchas WHERE id = ?').bind(id).run();
        }

        return isValid;
    } catch (e) {
        logError('[Captcha] Verification error:', e);
        return false;
    }
}

/**
 * 获取验证码 SVG 数据 URL（用于 img src）
 */
export function getCaptchaDataUrl(svg) {
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
}
