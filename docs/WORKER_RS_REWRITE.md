# worker-rs rewrite

This repo now has two backend tracks:

- `src/` is the compatibility Worker. It runs current upstream Sub-Store with Cloudflare shims, Durable Objects, and QuickJS for user script execution.
- `worker-rs/` is the native Cloudflare Worker target. It starts with Cloudflare-owned routes and should absorb Sub-Store behavior until the JS compatibility layer becomes optional.

## Current worker-rs scope

Implemented in `worker-rs/src/lib.rs`:

- `GET /api/utils/env`
- `GET /api/utils/worker-status`
- `GET /health`
- Cloudflare identity metadata and icon
- upstream backend version via `SUB_STORE_BACKEND_VERSION`

This is intentionally small. It gives Cloudflare Git builds a real Rust Worker target without pretending the whole Sub-Store runtime has already been ported.

## Why QuickJS still exists

Sub-Store upstream supports user-defined scripts and operators. Cloudflare Workers reject `eval()` and `new Function()`, so the compatibility Worker currently runs those scripts through QuickJS WASM.

The native Rust path should reduce QuickJS usage in this order:

1. Port subscription parsing, filtering, renaming, sorting, and export rendering to Rust.
2. Replace common script operators with typed Rust operators.
3. Keep QuickJS only as an optional trusted fallback for custom scripts.
4. Remove QuickJS when the remaining official features have native Rust equivalents or a deliberate unsupported status.

## Cloudflare-native target

Use Cloudflare products directly instead of emulating a generic Node service:

- Workers and Pages for request handling and frontend delivery.
- Secrets Store for dashboard JWT signing and future provider/webhook tokens.
- Durable Objects for per-user serial execution and strongly consistent state.
- D1 for queryable metadata, audit entries, and settings.
- R2 for large files such as GeoIP databases and generated artifacts.
- KV for low-risk cache and public metadata.
- Queues and Workflows for refresh pipelines.
- Analytics Engine and Workers Logs for observability.
- Workers AI, AI Gateway, and Vectorize only for optional enrichment/search features.
- Images and Stream only when subscription artifacts or dashboard media actually need them.

## Borrowed ideas

From `Yu9191/sub-store-workers`:

- expose backend as Workers/Cloudflare instead of Surge;
- keep Cloudflare icon metadata in backend env;
- prefer build-time rewrites for upstream compatibility;
- precompile parser grammar where possible instead of runtime dynamic code.

From `SaintWe/Sub-Store-Workers`:

- the existing Durable Object dashboard adapter was a useful migration base, but this repo is now independent and no longer a fork.

## Build

```sh
pnpm run build:worker-rs
```

That command runs Wrangler in `worker-rs/` with a dry-run output. The native Worker uses `worker-rs/wrangler.jsonc`.

Rust crate dependencies use Cargo wildcard requirements (`*`) because Cargo does not support an npm-style `latest` literal. `worker-rs/Cargo.lock` is ignored so each fresh build resolves the latest compatible crates. The production Worker still uses the compatibility build until the native Rust implementation covers the Sub-Store API surface.
