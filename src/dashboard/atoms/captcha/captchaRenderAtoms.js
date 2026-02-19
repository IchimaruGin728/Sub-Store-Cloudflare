const CAPTCHA_LENGTH = 4;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(length = CAPTCHA_LENGTH) {
    let code = '';
    for (let i = 0; i < length; i++) {
        code += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    return code;
}

function randomColor(min = 0, max = 150) {
    const r = Math.floor(Math.random() * (max - min) + min);
    const g = Math.floor(Math.random() * (max - min) + min);
    const b = Math.floor(Math.random() * (max - min) + min);
    return `rgb(${r},${g},${b})`;
}

function generateSVG(code) {
    const width = 120;
    const height = 40;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`;
    svg += '<rect width="100%" height="100%" fill="#f8fafc"/>';

    for (let i = 0; i < 4; i++) {
        const x1 = Math.random() * width;
        const y1 = Math.random() * height;
        const x2 = Math.random() * width;
        const y2 = Math.random() * height;
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${randomColor(150, 200)}" stroke-width="1"/>`;
    }

    for (let i = 0; i < 30; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        svg += `<circle cx="${x}" cy="${y}" r="1" fill="${randomColor(150, 200)}"/>`;
    }

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

function generateCaptchaId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSvgCaptcha() {
    const code = generateCode();
    const id = generateCaptchaId();
    const svg = generateSVG(code);
    return { id, code, svg };
}

export function getCaptchaDataUrlFromSvg(svg) {
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
}
