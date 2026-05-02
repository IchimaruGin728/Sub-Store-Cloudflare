#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"

bash scripts/fetch-substore.sh

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable pnpm
fi

(cd sub-store/backend && pnpm install)
pnpm install
pnpm run build
