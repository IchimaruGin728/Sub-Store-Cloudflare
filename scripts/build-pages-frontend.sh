#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_REPO="${FRONTEND_REPO:-sub-store-org/Sub-Store-Front-End}"
FRONTEND_VERSION="${FRONTEND_VERSION:-}"
OUT_ROOT="${OUT_ROOT:-${ROOT_DIR}/frontend-dist}"
OUT_DIR="${OUT_ROOT}/dist"
UPSTREAM_VERSION_FILE="${ROOT_DIR}/.upstream/frontend-version"

log() {
  printf '%s\n' "[build-pages-frontend] $*" >&2
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[build-pages-frontend] missing command: $1" >&2
    exit 1
  }
}

require_cmd curl
require_cmd unzip
require_cmd node

if [[ -z "${FRONTEND_VERSION}" ]]; then
  if [[ -f "${UPSTREAM_VERSION_FILE}" ]]; then
    FRONTEND_VERSION="$(tr -d '[:space:]' < "${UPSTREAM_VERSION_FILE}")"
    if [[ -n "${FRONTEND_VERSION}" ]]; then
      log "Using .upstream/frontend-version: ${FRONTEND_VERSION}"
    fi
  fi
fi

if [[ -z "${FRONTEND_VERSION}" ]]; then
  log "FRONTEND_VERSION not set; resolving latest release for ${FRONTEND_REPO}"
  FRONTEND_VERSION="$(
    curl -fsSL \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/${FRONTEND_REPO}/releases/latest" \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); if (!j.tag_name) throw new Error("missing tag_name"); process.stdout.write(String(j.tag_name));})'
  )"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

log "Downloading ${FRONTEND_REPO}@${FRONTEND_VERSION}"
curl -fL --retry 3 --retry-delay 2 --retry-all-errors \
  "https://github.com/${FRONTEND_REPO}/releases/download/${FRONTEND_VERSION}/dist.zip" \
  -o "${tmp}/dist.zip"

rm -rf "${OUT_ROOT}"
mkdir -p "${OUT_ROOT}"
unzip -q "${tmp}/dist.zip" -d "${OUT_ROOT}"

if [[ ! -d "${OUT_DIR}" ]]; then
  echo "[build-pages-frontend] expected dist directory not found: ${OUT_DIR}" >&2
  exit 1
fi

node "${ROOT_DIR}/scripts/brand-frontend-dist.js" "${OUT_DIR}"
log "OK -> ${OUT_DIR}"
