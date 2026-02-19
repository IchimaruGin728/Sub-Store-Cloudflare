/**
 * L3 - Molecule（Service）
 * SVG 验证码：创建/校验 + 持久化（验证码图形生成由 L4 atoms 提供）。
 */
import { error as logError } from '../../../utils/logger.js';
import { generateSvgCaptcha } from '../../atoms/captcha/captchaRenderAtoms.js';
import { getCaptchaDataUrlFromSvg } from '../../atoms/captcha/captchaRenderAtoms.js';
import { deleteExpiredCaptchas } from '../../atoms/captchaSql/captchaSqlAtoms.js';
import { insertCaptcha } from '../../atoms/captchaSql/captchaSqlAtoms.js';
import { getCaptchaForVerify } from '../../atoms/captchaSql/captchaSqlAtoms.js';
import { deleteCaptcha } from '../../atoms/captchaSql/captchaSqlAtoms.js';
import { incrementCaptchaAttempts } from '../../atoms/captchaSql/captchaSqlAtoms.js';

// 验证码配置
const CAPTCHA_EXPIRES = 5 * 60 * 1000; // 5分钟过期

/**
 * 清理过期验证码
 */
async function cleanExpired(ctx) {
    try {
        deleteExpiredCaptchas(ctx, Date.now());
    } catch (e) {
        // 忽略清理错误
    }
}

/**
 * 创建新验证码
 * @param {object} ctx
 * @returns {Promise<{ id: string, svg: string }>}
 */
export async function createCaptcha(ctx) {
    // 清理过期验证码
    await cleanExpired(ctx);

    const { id, code, svg } = generateSvgCaptcha();
    const expiresAt = Date.now() + CAPTCHA_EXPIRES;

    insertCaptcha(ctx, id, code.toUpperCase(), expiresAt);

    return { id, svg };
}

/**
 * 验证验证码
 * @param {object} ctx
 * @param {string} id 验证码 ID
 * @param {string} input 用户输入
 * @returns {Promise<boolean>}
 */
export async function verifyCaptcha(ctx, id, input) {
    if (!id || !input) return false;

    try {
        const result = getCaptchaForVerify(ctx, id);

        if (!result) return false;

        // 检查是否过期
        if (Date.now() > result.expires_at) {
            deleteCaptcha(ctx, id);
            return false;
        }

        // 限制尝试次数
        if (result.attempts >= 3) {
            deleteCaptcha(ctx, id);
            return false;
        }

        // 更新尝试次数
        incrementCaptchaAttempts(ctx, id);

        // 验证（不区分大小写）
        const isValid = result.code === input.toUpperCase();

        // 验证成功后删除，防止重复使用
        if (isValid) {
            deleteCaptcha(ctx, id);
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
    return getCaptchaDataUrlFromSvg(svg);
}
