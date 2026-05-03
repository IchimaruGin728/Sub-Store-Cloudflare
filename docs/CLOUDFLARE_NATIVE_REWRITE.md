# Sub-Store Cloudflare Native Rewrite

This project is moving away from "run upstream Sub-Store on Workers" toward a Cloudflare-native, single-user implementation.

## Product Direction

- Single-user first. No multi-user admin panel, no tenant management, no role system.
- Do not target official frontend compatibility. The frontend and backend can evolve together later.
- Public backend identity is Cloudflare Workers, not Surge.
- Keep the Sub-Store workflows that matter: subscription sources, file snippets, sync tasks, processors, preview, share/export, cron refresh, logs, backups, and script-like transforms.
- Prefer Cloudflare managed products whenever they make the implementation simpler, faster, or more reliable.
- Keep syncing upstream Sub-Store releases only as a reference source during migration, not as the runtime foundation.

## Cloudflare Mapping

| Capability | Cloudflare product | Use |
|------------|--------------------|-----|
| HTTP API and subscription output | Workers | Main API surface and edge routing |
| Per-user state and serialized writes | Durable Objects | Single active coordinator for config, jobs, logs, and cache metadata |
| Structured data | D1 | Queryable records for subscriptions, nodes, sync jobs, history, and logs |
| Large assets and backup snapshots | R2 | mmdb files, generated artifacts, exports, backups |
| Hot config and small cache | Workers KV | Fast reads for compiled outputs and lightweight settings |
| Async refresh and heavy processing | Queues | Subscription refresh, remote fetch fan-out, exports |
| Multi-step scheduled jobs | Workflows | Refresh pipelines with retries, checkpoints, and observability |
| Cron refresh | Cron Triggers | SGT 07:28 and 17:16 update checks; user-configurable refresh later |
| Secrets | Secrets Store / Worker secrets | Tokens, proxy auth, webhook credentials |
| Logs and metrics | Observability / Analytics Engine | Request logs, refresh latency, provider health, error rates |
| AI helpers | Workers AI / AI Gateway / Vectorize | Optional rule suggestions, node tagging, natural-language filters |
| Browser validation | Browser Rendering | Optional subscription provider checks requiring rendered pages |

## Functional Target

### Keep

- Subscription CRUD and grouping.
- Remote source refresh with cache, timeout, retry, and health metadata.
- Parser pipeline for common formats: Clash, Surge, Quantumult X, Loon, Sing-box, V2Ray, plain URI lists.
- Processor pipeline: filter, rename, sort, dedupe, policy grouping, region/provider tagging.
- Export templates for common clients.
- Sync tasks and scheduled refresh.
- Preview and diff before saving.
- Share/export links with optional token protection.
- Logs that explain which source or processor failed.
- Backup and restore.

### Improve

- Typed internal schema instead of patching upstream runtime state.
- Durable refresh jobs with retry/checkpoint support.
- Incremental updates: avoid recomputing unchanged sources.
- First-class Cloudflare storage split: D1 for records, R2 for large files, KV for hot compiled outputs.
- Stronger script isolation. Prefer a constrained transform DSL; add QuickJS only as an explicit fallback if native Rust operators are not enough.
- Build our own frontend against our API instead of patching official frontend dist.

### Drop

- Multi-user dashboard.
- Compatibility shims for Node/Express runtime assumptions.
- Official frontend API compatibility as a hard requirement.
- Upstream code patching as the long-term runtime strategy.

## Migration Plan

1. Stabilize current deploy path.
   - Use latest toolchain packages.
   - Use `wrangler.jsonc` only. Do not keep TOML Wrangler config.
- Keep upstream sync as a reference signal for parity tests.
   - Let Cloudflare Git integrations build/deploy Workers.
   - Keep GitHub Actions limited to upstream release monitoring and version marker commits.

2. Introduce native data model beside current adapter.
   - Define D1 schema for subscriptions, sources, processors, outputs, jobs, logs.
   - Add import/export from current Sub-Store data.

3. Implement native parser and export pipeline.
   - Start with read-only preview endpoints.
   - Compare native output with upstream output on the same data.
   - Current first slice: URI-list parser/exporter in `worker-rs/src/native`.

4. Replace write paths.
   - Build single-user UI over native API.
   - Remove multi-user dashboard flows.

5. Retire upstream runtime dependency.
   - Keep upstream sync only for reference tests and compatibility fixtures.
   - Remove Express/Sub-Store loader patches after parity is good enough.

## Current Runtime Split

- `worker-rs/` is the current deploy target. Root `wrangler.jsonc` builds it directly.
- The old `src/` JS compatibility Worker has been removed. The current build/deploy path is the Rust Worker in `worker-rs/`.
- Vite, Pages, React, and QuickJS are not part of the current deploy path.
- Rust should own parsing, exporting, storage orchestration, and refresh pipelines.

## Cloudflare Git Build Mode

GitHub Actions does not deploy this project. It only monitors upstream latest releases and commits `.upstream/*` version markers when they change. Cloudflare sees those commits through the Git integration and builds with Cloudflare quota.

Workers:

- Build command: `bash scripts/build-worker.sh`
- Config file: `wrangler.jsonc`
- Secret Store: bind `JWT_SECRET_STORE` to the `JWT_SECRET` account secret
- Local fallback: `JWT_SECRET` in `.dev.vars`
