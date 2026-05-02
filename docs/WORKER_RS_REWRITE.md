# worker-rs rewrite

This repo now deploys the native Rust Worker first:

- `worker-rs/` is the active Cloudflare Worker target.
- `src/` is legacy compatibility code parked for reference only and is not built by the root Wrangler config.
- Root `wrangler.jsonc` is the only Wrangler config.

## Current worker-rs scope

Implemented in `worker-rs/src/lib.rs`:

- `GET /api/utils/env`
- `GET /api/utils/worker-status`
- `GET /health`
- `GET /api/native/capabilities`
- `POST /api/native/parse`
- `POST /api/native/process`
- `POST /api/native/export`
- Cloudflare identity metadata and icon
- upstream backend version via `SUB_STORE_BACKEND_VERSION`
- Native parser model for URI subscription lists
- Native parsing for `ss`, `ssr`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`/`hy2`, `http`, `socks5`, `snell`, `tuic`, `anytls`, `wireguard`, and `ssh` where the input format exposes enough shared fields
- Whole-subscription base64 decode and node dedupe
- Native export targets: `json`, `uri-list`, `v2ray`, `clash`, `clash-meta`, `mihomo`, `stash`, `sing-box`, `surge`, `surge-mac`, `loon`, `quantumult-x`, `shadowrocket`, `surfboard`, and `egern`
- Native no-script processors: `dedupe`, `filter`, `rename`, `sort`, and `limit`

This is intentionally scoped. It gives Cloudflare Git builds a real Rust Worker target and starts replacing upstream's format normalization with typed Rust code without pretending the whole Sub-Store runtime has already been ported.

## QuickJS status

Sub-Store upstream supports user-defined scripts and operators. Cloudflare Workers reject `eval()` and `new Function()`. This repo previously carried a QuickJS WASM compatibility layer, but the current deploy path does not build or ship it.

The native Rust path should handle script-like behavior in this order:

1. Port subscription parsing, filtering, renaming, sorting, and export rendering to Rust.
2. Replace common script operators with typed Rust operators.
3. Add a constrained transform DSL for custom rules.
4. Consider QuickJS only as an explicit trusted fallback if native Rust coverage is not enough.

## Native API Draft

Parse a plain or base64 subscription URI list:

```http
POST /api/native/parse
Content-Type: application/json

{"content":"ss://aes-128-gcm:secret@example.com:8388#HK"}
```

Export normalized nodes:

```http
POST /api/native/export
Content-Type: application/json

{"target":"uri-list","content":"trojan://pass@example.com:443?security=tls&type=tcp#SG"}
```

Supported `target` values are currently `json`, `uri-list`, `v2ray`, `clash`, `clash-meta`, `mihomo`, `stash`, `sing-box`, `surge`, `surge-mac`, `loon`, `quantumult-x`, `shadowrocket`, `surfboard`, and `egern`.

Process nodes before export:

```http
POST /api/native/export
Content-Type: application/json

{
  "target": "clash",
  "content": "ss://aes-128-gcm:secret@example.com:8388#HK",
  "processors": {
    "dedupe": true,
    "rename": { "prefix": "[CF] " },
    "sort": { "by": "name" }
  }
}
```

## Cloudflare-native target

Use Cloudflare products directly instead of emulating a generic Node service:

- Workers for request handling and frontend delivery if a static UI is reintroduced later.
- Secrets Store for private runtime tokens and future provider/webhook tokens.
- Durable Objects for per-user serial execution and strongly consistent state.
- D1 for queryable metadata, audit entries, and settings.
- R2 for large files such as GeoIP databases and generated artifacts.
- KV for low-risk cache and public metadata.
- Queues and Workflows for refresh pipelines.
- Analytics Engine and Workers Logs for observability.
- Workers AI, AI Gateway, and Vectorize only for optional enrichment/search features.
- Images and Stream only when subscription artifacts actually need media processing.

## Borrowed ideas

From `Yu9191/sub-store-workers`:

- expose backend as Workers/Cloudflare instead of Surge;
- keep Cloudflare icon metadata in backend env;
- prefer build-time rewrites for upstream compatibility;
- precompile parser grammar where possible instead of runtime dynamic code.

From `SaintWe/Sub-Store-Workers`:

- the old Durable Object dashboard adapter was a useful migration base, but it has been removed and this repo is now independent.

## Build

```sh
pnpm run build
```

That command runs the root Wrangler config. Wrangler builds `worker-rs/` and writes a dry-run output.

Rust crate dependencies use Cargo wildcard requirements (`*`) because Cargo does not support an npm-style `latest` literal. `worker-rs/Cargo.lock` is ignored so each fresh build resolves the latest compatible crates.
