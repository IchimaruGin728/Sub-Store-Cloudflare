#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUBSTORE_REPO = process.env.SUBSTORE_REPO || 'sub-store-org/Sub-Store';
const FRONTEND_REPO = process.env.FRONTEND_REPO || 'sub-store-org/Sub-Store-Front-End';
const FORCE_DEPLOY = process.env.FORCE_DEPLOY || 'false';
const EVENT_NAME = process.env.EVENT_NAME || '';
const DEPLOY_FRONTEND_MODE = process.env.DEPLOY_FRONTEND_MODE || 'auto';
const RUN_ID = process.env.RUN_ID || `${Date.now()}`;
const GITHUB_OUTPUT = process.env.GITHUB_OUTPUT || '';
const GITHUB_API_TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';

const RETRY_TIMES = 3;
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeBoolean(value) {
  return String(value).trim().toLowerCase() === 'true';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
}

function ensureOutputValue(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized === 'null') {
    throw new Error(`输出值非法：${JSON.stringify(value)}`);
  }
  if (normalized.includes('\n') || normalized.includes('\r')) {
    throw new Error('输出值包含换行，无法写入 GITHUB_OUTPUT');
  }
  return normalized;
}

async function readLastVersion(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const value = content.trim();
    return value || 'none';
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return 'none';
    }
    throw error;
  }
}

async function writeOutputs(outputs) {
  if (!GITHUB_OUTPUT) {
    throw new Error('缺少 GITHUB_OUTPUT 环境变量');
  }
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  await fs.appendFile(GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
}

function buildHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'sub-store-cloudflare-check-updates',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (GITHUB_API_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_API_TOKEN}`;
  }
  return headers;
}

async function fetchLatestTag(repo) {
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
        throw new Error(`获取 ${repo} releases/latest 失败：响应不是合法 JSON（HTTP ${response.status}）`);
      }

      if (response.status !== 200) {
        const remaining = response.headers.get('x-ratelimit-remaining');
        const message = typeof body?.message === 'string' ? body.message : '';
        const isRateLimited = response.status === 403 && (remaining === '0' || /rate limit/i.test(message));

        if (isRateLimited) {
          throw new Error(`获取 ${repo} releases/latest 失败：GitHub API 限流（HTTP 403）`);
        }

        throw new Error(`获取 ${repo} releases/latest 失败：HTTP ${response.status}${message ? ` - ${message}` : ''}`);
      }

      const tagName = ensureOutputValue(body?.tag_name);
      return tagName;
    } catch (error) {
      lastError = error;
      if (attempt < RETRY_TIMES) {
        await sleep(attempt * 1000);
      }
    }
  }

  throw new Error(`获取 ${repo} 最新 release 版本失败（重试 ${RETRY_TIMES} 次后仍失败）：${toErrorMessage(lastError)}`);
}

async function main() {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const rootDir = path.resolve(currentDir, '..');
  const lastBackendPath = path.join(rootDir, '.last-backend-version');
  const lastFrontendPath = path.join(rootDir, '.last-frontend-version');

  const [backendVersion, frontendVersion] = await Promise.all([
    fetchLatestTag(SUBSTORE_REPO),
    fetchLatestTag(FRONTEND_REPO),
  ]);

  const [lastBackend, lastFrontend] = await Promise.all([
    readLastVersion(lastBackendPath),
    readLastVersion(lastFrontendPath),
  ]);

  console.log(`Current backend: ${backendVersion} (last: ${lastBackend})`);
  console.log(`Current frontend: ${frontendVersion} (last: ${lastFrontend})`);

  const deployToken = `ACTION_START_${RUN_ID}`;
  const deployBackend =
    normalizeBoolean(FORCE_DEPLOY) || EVENT_NAME === 'push' || backendVersion !== lastBackend
      ? deployToken
      : 'ACTION_HOLD';

  let deployFrontendNeeded = 'ACTION_HOLD';
  if (DEPLOY_FRONTEND_MODE === 'deploy') {
    deployFrontendNeeded = deployToken;
  } else if (DEPLOY_FRONTEND_MODE === 'skip') {
    deployFrontendNeeded = 'ACTION_HOLD';
  } else if (frontendVersion !== lastFrontend) {
    deployFrontendNeeded = deployToken;
  }

  await writeOutputs({
    backend_version: backendVersion,
    frontend_version: frontendVersion,
    deploy_backend: deployBackend,
    deploy_frontend_needed: deployFrontendNeeded,
  });

  console.log(`Backend deploy: ${deployBackend === 'ACTION_HOLD' ? 'NO' : 'YES'}`);
  if (DEPLOY_FRONTEND_MODE === 'deploy') {
    console.log('Frontend deploy: YES (manual deploy)');
  } else if (DEPLOY_FRONTEND_MODE === 'skip') {
    console.log('Frontend deploy: NO (manual skip)');
  } else {
    console.log(`Frontend deploy: ${deployFrontendNeeded === 'ACTION_HOLD' ? 'NO' : 'YES (version changed)'}`);
  }
}

main().catch((error) => {
  console.error(`::error::${toErrorMessage(error)}`);
  process.exit(1);
});
