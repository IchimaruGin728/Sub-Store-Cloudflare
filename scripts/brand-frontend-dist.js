#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve(process.argv[2] || 'frontend-dist/dist');
const brandName = process.env.FRONTEND_BRAND_NAME || 'Sub-Store Cloudflare';
const shortName = process.env.FRONTEND_BRAND_SHORT_NAME || 'SS Cloudflare';

const cloudflareIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="#f38020"/>
  <path fill="#fff" d="M166.8 154.2c14.6 0 26.5-11.8 26.5-26.4s-11.9-26.4-26.5-26.4h-2.1C157.9 78.7 137 62 112.3 62c-30.3 0-54.9 24.5-54.9 54.7 0 2.2.1 4.3.4 6.4C38.6 126.4 24 143.1 24 163.2 24 185.8 42.4 204 65 204h99.2c13.8 0 25-11.2 25-25s-11.2-24.8-25-24.8h-58.6c-5.1 0-9.2-4.1-9.2-9.1s4.1-9.1 9.2-9.1h61.2Z"/>
  <path fill="#faae40" d="M183.3 136h8.4c22.3 0 40.3 18 40.3 40.1S214 216 191.7 216h-82.9c-5.1 0-9.2-4.1-9.2-9.1s4.1-9.1 9.2-9.1h82.9c12.1 0 21.9-9.7 21.9-21.7s-9.8-21.7-21.9-21.7h-8.4c-5.1 0-9.2-4.1-9.2-9.1s4.1-9.3 9.2-9.3Z"/>
</svg>
`;

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function writeText(filePath, content) {
  await fs.writeFile(filePath, content, 'utf8');
}

async function patchIndexHtml() {
  const indexPath = path.join(distDir, 'index.html');
  let html = await readText(indexPath);

  html = html.replace(/<title>.*?<\/title>/i, `<title>${brandName}</title>`);
  html = html.replace(
    /<link rel="icon" href="[^"]*" type="image\/svg\+xml" \/>/i,
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />'
  );

  if (!html.includes('name="application-name"')) {
    html = html.replace('</head>', `  <meta name="application-name" content="${brandName}" />\n</head>`);
  }

  await writeText(indexPath, html);
}

async function patchManifest(fileName) {
  const manifestPath = path.join(distDir, fileName);
  let raw;
  try {
    raw = await readText(manifestPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }

  const manifest = JSON.parse(raw);
  manifest.name = brandName;
  manifest.short_name = shortName;
  manifest.description = 'Sub-Store optimized for Cloudflare Workers and Pages';
  manifest.theme_color = '#f38020';
  manifest.background_color = '#ffffff';

  await writeText(manifestPath, `${JSON.stringify(manifest)}\n`);
}

async function main() {
  const stat = await fs.stat(distDir);
  if (!stat.isDirectory()) {
    throw new Error(`Frontend dist path is not a directory: ${distDir}`);
  }

  await writeText(path.join(distDir, 'favicon.svg'), cloudflareIconSvg);
  await patchIndexHtml();
  await Promise.all([
    patchManifest('manifest.webmanifest'),
    patchManifest('manifest.json'),
    patchManifest('manifests.json'),
  ]);

  console.error(`[brand-frontend-dist] Branded ${distDir} as ${brandName}`);
}

main().catch((error) => {
  console.error(`[brand-frontend-dist] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
