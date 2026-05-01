#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

bash scripts/fetch-substore.sh

if command -v pnpm >/dev/null 2>&1; then
  (cd sub-store/backend && pnpm install)
else
  (cd sub-store/backend && corepack enable pnpm && pnpm install)
fi

if command -v bun >/dev/null 2>&1; then
  bun install
  bun run build
else
  npm install
  npm run build
fi
