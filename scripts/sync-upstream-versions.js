#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUBSTORE_REPO = process.env.SUBSTORE_REPO || 'sub-store-org/Sub-Store';
const FRONTEND_REPO = process.env.FRONTEND_REPO || 'sub-store-org/Sub-Store-Front-End';
const GITHUB_API_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT || '';

const RETRY_TIMES = 3;
const REQUEST_TIMEOUT_MS = 10_000;
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toErrorMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}

function ensureOutputValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null') {
    throw new Error(`Invalid output value: ${JSON.stringify(value)}`);
  }
  if (normalized.includes('\n') || normalized.includes('\r')) {
    throw new Error('Output value contains a newline');
  }
  return normalized;
}

function buildHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sub-store-cloudflare-upstream-monitor',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_API_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_API_TOKEN}`;
  }
  return headers;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLatestRelease(repo) {
  const release = await fetchJsonWithRetry(`https://api.github.com/repos/${repo}/releases/latest`, repo, 'latest release');
  return normalizeRelease(repo, release);
}

async function fetchRecentReleases(repo, since) {
  const releases = await fetchJsonWithRetry(
    `https://api.github.com/repos/${repo}/releases?per_page=50`,
    repo,
    'recent releases'
  );
  if (!Array.isArray(releases)) {
    throw new Error(`Failed to fetch ${repo} recent releases: response is not an array`);
  }

  return releases
    .map((release) => normalizeRelease(repo, release))
    .filter((release) => {
      const publishedAt = Date.parse(release.publishedAt);
      return Number.isFinite(publishedAt) && publishedAt >= since.getTime();
    });
}

async function fetchJsonWithRetry(url, repo, label) {
  const headers = buildHeaders();
  let lastError;

  for (let attempt = 1; attempt <= RETRY_TIMES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const rawBody = await response.text();
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new Error(`Failed to fetch ${repo} latest release: response is not JSON (HTTP ${response.status})`);
      }

      if (response.status !== 200) {
        const message = typeof body?.message === 'string' ? body.message : '';
        throw new Error(`Failed to fetch ${repo} ${label}: HTTP ${response.status}${message ? ` - ${message}` : ''}`);
      }

      return body;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_TIMES) {
        await sleep(attempt * 1000);
      }
    }
  }

  throw new Error(`Failed to fetch ${repo} ${label} after ${RETRY_TIMES} attempts: ${toErrorMessage(lastError)}`);
}

function normalizeRelease(repo, release) {
  return {
    repo,
    tagName: ensureOutputValue(release?.tag_name),
    name: typeof release?.name === 'string' ? release.name : '',
    htmlUrl: typeof release?.html_url === 'string' ? release.html_url : '',
    publishedAt: typeof release?.published_at === 'string' ? release.published_at : '',
  };
}

function getSingaporeDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Singapore',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function getIsoWeek(year, month, day) {
  const local = new Date(Date.UTC(year, month - 1, day));
  const weekday = local.getUTCDay() || 7;
  local.setUTCDate(local.getUTCDate() + 4 - weekday);
  const weekYearStart = new Date(Date.UTC(local.getUTCFullYear(), 0, 1));
  return Math.ceil(((local - weekYearStart) / 86_400_000 + 1) / 7);
}

function buildCloudflareVersion(date = new Date()) {
  const { year, month, day } = getSingaporeDateParts(date);
  const week = getIsoWeek(year, month, day);
  const shortYear = String(year).slice(-2);
  return `CF-${shortYear}W${String(week).padStart(2, '0')}`;
}

function toSemverVersion(displayVersion) {
  const match = /^CF-(\d{2})W(\d{2})$/.exec(displayVersion);
  if (!match) {
    throw new Error(`Invalid Cloudflare version: ${displayVersion}`);
  }
  return `${Number(match[1])}.${Number(match[2])}.0`;
}

async function updatePackageVersion(rootDir, version) {
  const packagePath = path.join(rootDir, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  packageJson.version = version;
  await fs.writeFile(packagePath, `${JSON.stringify(packageJson, null, 4)}\n`, 'utf8');
}

async function updateWranglerVersion(rootDir, version) {
  const wranglerPath = path.join(rootDir, 'wrangler.jsonc');
  const wranglerJson = JSON.parse(await fs.readFile(wranglerPath, 'utf8'));
  wranglerJson.vars = {
    ...(wranglerJson.vars || {}),
    SUB_STORE_CLOUDFLARE_VERSION: version,
  };
  await fs.writeFile(wranglerPath, `${JSON.stringify(wranglerJson, null, 4)}\n`, 'utf8');
}

async function readVersion(filePath) {
  try {
    return (await fs.readFile(filePath, 'utf8')).trim() || 'none';
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 'none';
    }
    throw error;
  }
}

async function writeOutput(outputs) {
  if (!GITHUB_OUTPUT) return;
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  await fs.appendFile(GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
}

async function main() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const rootDir = path.resolve(path.dirname(currentFilePath), '..');
  const upstreamDir = path.join(rootDir, '.upstream');
  const backendVersionPath = path.join(upstreamDir, 'backend-version');
  const frontendVersionPath = path.join(upstreamDir, 'frontend-version');
  const cloudflareVersionPath = path.join(upstreamDir, 'cloudflare-version');
  const metadataPath = path.join(upstreamDir, 'metadata.json');
  const checkedAt = new Date();
  const since = new Date(checkedAt.getTime() - ONE_WEEK_MS);
  const cloudflareVersion = buildCloudflareVersion(checkedAt);
  const packageVersion = toSemverVersion(cloudflareVersion);

  const [backend, frontend, backendRecent, frontendRecent] = await Promise.all([
    fetchLatestRelease(SUBSTORE_REPO),
    fetchLatestRelease(FRONTEND_REPO),
    fetchRecentReleases(SUBSTORE_REPO, since),
    fetchRecentReleases(FRONTEND_REPO, since),
  ]);

  const [previousBackend, previousFrontend, previousCloudflareVersion] = await Promise.all([
    readVersion(backendVersionPath),
    readVersion(frontendVersionPath),
    readVersion(cloudflareVersionPath),
  ]);

  const backendChanged = backend.tagName !== previousBackend;
  const frontendChanged = frontend.tagName !== previousFrontend;
  const cloudflareVersionChanged = cloudflareVersion !== previousCloudflareVersion;
  const changed = backendChanged || frontendChanged || cloudflareVersionChanged;

  await fs.mkdir(upstreamDir, { recursive: true });
  await fs.writeFile(backendVersionPath, `${backend.tagName}\n`, 'utf8');
  await fs.writeFile(frontendVersionPath, `${frontend.tagName}\n`, 'utf8');
  await fs.writeFile(cloudflareVersionPath, `${cloudflareVersion}\n`, 'utf8');
  await updatePackageVersion(rootDir, packageVersion);
  await updateWranglerVersion(rootDir, cloudflareVersion);
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        checkedAt: checkedAt.toISOString(),
        timezone: 'Asia/Singapore',
        cloudflareVersion,
        packageVersion,
        previousCloudflareVersion,
        recentWindow: {
          since: since.toISOString(),
          until: checkedAt.toISOString(),
        },
        backend,
        frontend,
        recent: {
          backend: backendRecent,
          frontend: frontendRecent,
        },
        previous: {
          backend: previousBackend,
          frontend: previousFrontend,
        },
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  console.log(`Backend latest: ${backend.tagName} (previous: ${previousBackend})`);
  console.log(`Frontend latest: ${frontend.tagName} (previous: ${previousFrontend})`);
  console.log(`Cloudflare version: ${cloudflareVersion} (previous: ${previousCloudflareVersion})`);
  console.log(`Backend releases in last 7 days: ${backendRecent.length}`);
  console.log(`Frontend releases in last 7 days: ${frontendRecent.length}`);
  console.log(`Changed: ${changed ? 'yes' : 'no'}`);

  await writeOutput({
    cloudflare_version: cloudflareVersion,
    backend_version: backend.tagName,
    frontend_version: frontend.tagName,
    backend_recent_count: String(backendRecent.length),
    frontend_recent_count: String(frontendRecent.length),
    backend_changed: String(backendChanged),
    frontend_changed: String(frontendChanged),
    cloudflare_version_changed: String(cloudflareVersionChanged),
    changed: String(changed),
  });
}

main().catch((error) => {
  console.error(`::error::${toErrorMessage(error)}`);
  process.exit(1);
});
