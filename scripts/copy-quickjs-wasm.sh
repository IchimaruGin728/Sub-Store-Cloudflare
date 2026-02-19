#!/usr/bin/env bash
set -euo pipefail

# Cloudflare Workers (and some bundling setups) require importing .wasm via a RELATIVE PATH
# to get a WebAssembly.Module.
#
# quickjs-emscripten's Cloudflare Workers example uses the same approach:
# copy the required wasm variant(s) from node_modules into our src tree.
# Ref: https://github.com/justjake/quickjs-emscripten/tree/main/examples/cloudflare-workers

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT_DIR}/src/adapters/quickjs/wasm"

mkdir -p "${OUT_DIR}"

resolve_wasm_path() {
  local pkg="$1"
  local expr="require.resolve('${pkg}/wasm')"

  if command -v node >/dev/null 2>&1; then
    node -p "${expr}"
    return
  fi

  if command -v bun >/dev/null 2>&1; then
    bun -p "${expr}"
    return
  fi

  echo "[copy-quickjs-wasm] Missing runtime: need node or bun" >&2
  exit 1
}

copy_variant() {
  local variant_name="$1" # e.g. RELEASE_SYNC
  local kebab
  kebab="$(echo "${variant_name}" | tr '[:upper:]' '[:lower:]' | tr '_' '-')"

  local pkg="@jitl/quickjs-wasmfile-${kebab}"
  local wasm_file
  wasm_file="$(resolve_wasm_path "${pkg}")"

  if [[ ! -f "${wasm_file}" ]]; then
    echo "[copy-quickjs-wasm] wasm file not found for ${pkg}: ${wasm_file}" >&2
    exit 1
  fi

  cp -f "${wasm_file}" "${OUT_DIR}/${variant_name}.wasm"

  # Optional source map (some variants provide it)
  if [[ -f "${wasm_file}.map" ]]; then
    cp -f "${wasm_file}.map" "${OUT_DIR}/${variant_name}.wasm.map.txt"
  fi
}

copy_variant "RELEASE_SYNC"

echo "[copy-quickjs-wasm] OK -> ${OUT_DIR}" >&2
