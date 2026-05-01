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
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
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
        throw new Error(`Failed to fetch ${repo} latest release: HTTP ${response.status}${message ? ` - ${message}` : ''}`);
      }

      return {
        repo,
        tagName: ensureOutputValue(body?.tag_name),
        name: typeof body?.name === 'string' ? body.name : '',
        htmlUrl: typeof body?.html_url === 'string' ? body.html_url : '',
        publishedAt: typeof body?.published_at === 'string' ? body.published_at : '',
      };
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_TIMES) {
        await sleep(attempt * 1000);
      }
    }
  }

  throw new Error(`Failed to fetch ${repo} latest release after ${RETRY_TIMES} attempts: ${toErrorMessage(lastError)}`);
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
  const metadataPath = path.join(upstreamDir, 'metadata.json');

  const [backend, frontend] = await Promise.all([
    fetchLatestRelease(SUBSTORE_REPO),
    fetchLatestRelease(FRONTEND_REPO),
  ]);

  const [previousBackend, previousFrontend] = await Promise.all([
    readVersion(backendVersionPath),
    readVersion(frontendVersionPath),
  ]);

  const backendChanged = backend.tagName !== previousBackend;
  const frontendChanged = frontend.tagName !== previousFrontend;
  const changed = backendChanged || frontendChanged;

  await fs.mkdir(upstreamDir, { recursive: true });
  await fs.writeFile(backendVersionPath, `${backend.tagName}\n`, 'utf8');
  await fs.writeFile(frontendVersionPath, `${frontend.tagName}\n`, 'utf8');
  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        backend,
        frontend,
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
  console.log(`Changed: ${changed ? 'yes' : 'no'}`);

  await writeOutput({
    backend_version: backend.tagName,
    frontend_version: frontend.tagName,
    backend_changed: String(backendChanged),
    frontend_changed: String(frontendChanged),
    changed: String(changed),
  });
}

main().catch((error) => {
  console.error(`::error::${toErrorMessage(error)}`);
  process.exit(1);
});
