# worker-rs rewrite

This repo now deploys the native Rust Worker first:

- `worker-rs/` is the active Cloudflare Worker target.
- The old JS compatibility Worker and frontend/dashboard files have been removed from this repo.
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
- `POST /api/native/fetch/parse`
- `POST /api/native/fetch/export`
- `POST /api/refresh`
- `POST /api/refresh/subscriptions`
- `POST /api/refresh/collections`
- `POST /api/sub/:name/refresh`
- `POST /api/collection/:name/refresh`
- `GET /api/backup`
- `POST /api/backup`
- `POST /api/backup/restore`
- `POST /api/native/store/init`
- `GET /api/native/store/:scope`
- `GET /api/native/store/:scope/:name`
- `PUT /api/native/store/:scope/:name`
- `DELETE /api/native/store/:scope/:name`
- `GET /api/subs`
- `POST /api/subs`
- `PUT /api/subs`
- `GET /api/sub/:name`
- `PATCH /api/sub/:name`
- `DELETE /api/sub/:name`
- `GET /api/sub/:name/export`
- `POST /api/sub/:name/export`
- `GET /api/sub/:name/:target`
- `POST /api/sub/:name/artifact`
- `GET /api/collections`
- `POST /api/collections`
- `PUT /api/collections`
- `GET /api/collection/:name`
- `PATCH /api/collection/:name`
- `DELETE /api/collection/:name`
- `GET /api/collection/:name/export`
- `POST /api/collection/:name/export`
- `GET /api/collection/:name/:target`
- `POST /api/collection/:name/artifact`
- `GET /api/files`
- `POST /api/files`
- `PUT /api/files`
- `GET /api/file/:name`
- `PATCH /api/file/:name`
- `DELETE /api/file/:name`
- `GET /api/file/:name/raw`
- `POST /api/file/:name/raw`
- `GET /api/artifacts`
- `POST /api/artifacts`
- `PUT /api/artifacts`
- `GET /api/artifact/:name`
- `PATCH /api/artifact/:name`
- `DELETE /api/artifact/:name`
- `GET /api/artifact/:name/raw`
- `POST /api/artifact/:name/raw`
- `GET /api/settings`
- `POST /api/settings`
- `PUT /api/settings`
- `GET /api/setting/:name`
- `PATCH /api/setting/:name`
- `DELETE /api/setting/:name`
- `GET /api/tokens`
- `POST /api/tokens`
- `PUT /api/tokens`
- `GET /api/token/:name`
- `PATCH /api/token/:name`
- `DELETE /api/token/:name`
- Cloudflare identity metadata and icon
- upstream backend version via `SUB_STORE_BACKEND_VERSION`
- Native parser model for URI subscription lists
- Native parsing for `ss`, `ssr`, `vmess`, `vless`, `trojan`, `hysteria`, `hysteria2`/`hy2`, `http`, `socks5`, `snell`, `tuic`, `anytls`, `wireguard`, and `ssh` where the input format exposes enough shared fields
- Native parsing for common client line formats: Surge/Loon-style `Name = type, host, port, key=value` and Quantumult X-style `type=host:port,key=value,tag=Name`
- Whole-subscription base64 decode and node dedupe
- Native export targets: `json`, `uri-list`, `v2ray`, `clash`, `clash-meta`, `mihomo`, `stash`, `sing-box`, `surge`, `surge-mac`, `loon`, `quantumult-x`, `shadowrocket`, `surfboard`, and `egern`
- Native no-script processors: `dedupe`, `filter`, `rename`, `flag`, `tag`, `sort`, `limit`, and `reverse`

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

Fetch a remote subscription URL at the edge, then parse or export it:

```http
POST /api/native/fetch/export
Content-Type: application/json

{
  "url": "https://example.com/sub",
  "target": "sing-box",
  "processors": {
    "dedupe": true,
    "sort": { "by": "name" }
  }
}
```

Store owner-only JSON records in D1:

```http
PUT /api/native/store/subscriptions/main
Authorization: Bearer <JWT_SECRET>
Content-Type: application/json

{"value":{"name":"main","url":"https://example.com/sub"}}
```

First-class Sub-Store resource records are now backed by that same D1 table:

```http
POST /api/subs
Authorization: Bearer <JWT_SECRET>
Content-Type: application/json

{"name":"main","url":"https://example.com/sub","process":[{"type":"dedupe"}]}
```

The implemented owner-only resources are `subscriptions`, `collections`, `files`, `artifacts`, `settings`, and `tokens`. List endpoints use `/api/subs`, `/api/collections`, `/api/files`, `/api/artifacts`, `/api/settings`, and `/api/tokens`; item endpoints use `/api/sub/:name`, `/api/collection/:name`, `/api/file/:name`, `/api/artifact/:name`, `/api/setting/:name`, and `/api/token/:name`. `PUT` on a list endpoint replaces that resource scope, while `PATCH` on an item endpoint shallow-merges JSON fields.

Saved subscriptions and collections can be exported directly:

```http
GET /api/sub/main/export?target=sing-box
Authorization: Bearer <JWT_SECRET>
```

Subscription clients that cannot send headers can use the token query parameter and a short target path:

```http
GET /api/sub/main/sing-box?format=raw&token=<JWT_SECRET>
```

```http
POST /api/collection/daily/export
Authorization: Bearer <JWT_SECRET>
Content-Type: application/json

{"target":"clash","processors":{"dedupe":true,"sort":{"by":"name"}}}
```

Subscription records may contain `content`, `source`, or `url`. Collection records may contain `subscriptions`, `subs`, `items`, `urls`, or `sources`; string entries are resolved as saved subscription names, remote URLs, or inline content in that order. Add `format=raw` to return only the exported text instead of the JSON export envelope. Auth accepts `Authorization: Bearer ...`, `x-sub-store-token`, or query `token`/`key`/`sub-store-token`.

Resource CRUD still requires `JWT_SECRET_STORE`. Export/raw routes can also use saved read tokens from the `tokens` resource, so subscription clients do not need the owner secret:

```http
POST /api/tokens
Authorization: Bearer <JWT_SECRET>
Content-Type: application/json

{"name":"phone","token":"client-read-token","enabled":true}
```

Processors can be stored as the native object shape or as an upstream-style array:

```json
{
  "process": [
    { "type": "dedupe", "by": "server" },
    { "type": "filter", "include": "SG|HK", "network": "grpc|ws", "tls": true },
    { "type": "rename", "template": "{flag} {protocol} {name}" },
    { "type": "flag", "position": "prefix" },
    { "type": "tag", "protocol": true, "network": true, "tls": true, "position": "suffix" },
    { "type": "sort", "by": "name" },
    { "type": "limit", "limit": 50 },
    { "type": "reverse" }
  ]
}
```

Saved exports can also be materialized into the `artifacts` resource:

```http
POST /api/sub/main/artifact
Authorization: Bearer <JWT_SECRET>
Content-Type: application/json

{"name":"main-sing-box","target":"sing-box","processors":{"dedupe":true}}
```

Generated artifacts store `sourceKind`, `sourceName`, `target`, `content`, `stats`, `warnings`, and `generatedAt` in D1. Use `/api/artifact/:name/raw` to read only the generated content. Saved `files` and `artifacts` can expose raw content through `/api/file/:name/raw` and `/api/artifact/:name/raw`; records may contain `content`, `source`, or `url`.

Refresh saved records into artifacts:

```http
POST /api/refresh
Authorization: Bearer <JWT_SECRET>
Content-Type: application/json

{"targets":["sing-box","clash"],"names":["main"],"subscriptions":true,"collections":false}
```

`/api/refresh/subscriptions`, `/api/refresh/collections`, `/api/sub/:name/refresh`, and `/api/collection/:name/refresh` narrow the scope. Records with `enabled: false` are skipped unless `includeDisabled` is true. If a record has `targets`, `target`, `type`, or `platform`, those targets are used when the request does not override them. Otherwise `json` is generated. Artifact names default to `<record-name>-<target>`, or can be overridden by a record `artifact` string or `artifacts` object keyed by target.

The Worker also has Cloudflare Cron Triggers configured at UTC `23:28` and `09:16`, matching SGT `07:28` and `17:16`. The scheduled handler refreshes enabled subscriptions and collections through the same Rust path.

Backup and restore all owner resources:

```http
GET /api/backup
Authorization: Bearer <JWT_SECRET>
```

```http
POST /api/backup/restore
Authorization: Bearer <JWT_SECRET>
Content-Type: application/json

{"replace":true,"resources":{"subscriptions":[{"name":"main","url":"https://example.com/sub"}]}}
```

Backups include `subscriptions`, `collections`, `files`, `artifacts`, `settings`, and `tokens`. Add repeated `scope` query parameters to export only selected scopes, for example `/api/backup?scope=subscriptions&scope=collections`.

The low-level D1 store remains available for internal/native records. `scope` maps to resource types such as `subscriptions`, `collections`, `files`, `artifacts`, `tokens`, and `settings`. All store and resource routes require the `JWT_SECRET_STORE` secret via either `Authorization: Bearer ...` or `x-sub-store-token`.

## Cloudflare-native target

Use Cloudflare products directly instead of emulating a generic Node service:

- Workers for request handling and frontend delivery if a static UI is reintroduced later.
- Secrets Store for private runtime tokens and future provider/webhook tokens.
- D1 binding `SUB_STORE_DB` for owner data, settings, and first-class Sub-Store records.
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
