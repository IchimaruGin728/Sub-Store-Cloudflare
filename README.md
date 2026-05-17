# Sub-Store Cloudflare

> **单用户 · Cloudflare-native · Rust 原生**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![D1](https://img.shields.io/badge/Storage-D1-FFCF00?logo=cloudflare&logoColor=black)](https://developers.cloudflare.com/d1/)
[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare_Git_Integration-F38020)](https://developers.cloudflare.com/pages/functions/)

[![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github)](https://github.com/IchimaruGin728/Sub-Store-Cloudflare)
[![GitLab](https://img.shields.io/badge/GitLab-Mirror-FC6D26?logo=gitlab&logoColor=white)](https://gitlab.com/IchimaruGin728/sub-store-cloudflare)

---

## 📋 项目定位

放弃兼容上游 Sub-Store 的运行时补丁方案。转向 **Cloudflare 原生独立实现**。

**核心原则：**
- 🎯 单用户优先。无多租户、无角色系统、无管理面板
- 🔒 不追求官方前端兼容。前后端可独立演进
- ⚡ 优先使用 Cloudflare 托管产品，简化实现、提升性能
- 🦀 Rust 原生重写核心逻辑，替代 QuickJS/eval 方案

---

## 🏗️ 架构

```
┌─────────────────────────────────────────────┐
│  Cloudflare Pages (前端)                     │
│  Astro + UnoCSS + Hono + Preact             │
└──────────────┬──────────────────────────────┘
               │ fetch + Bearer token
┌──────────────▼──────────────────────────────┐
│  Cloudflare Worker (后端)                    │
│  worker-rs (Rust 原生)                       │
├─────────────────────────────────────────────┤
│  D1          │ 结构化数据存储                  │
│  KV          │ 编译结果缓存                   │
│  R2          │ 备份快照存储                   │
│  Queues      │ 异步刷新任务                   │
│  Workflows   │ 多步持久执行                   │
│  Analytics   │ 自定义指标                     │
│  Secrets     │ JWT 认证                      │
│  Cron        │ 定时刷新                      │
└─────────────────────────────────────────────┘
```

---

## ✅ 已实现功能

### 后端 (worker-rs)

| 模块 | 状态 | 说明 |
|------|------|------|
| 📦 D1 存储 | ✅ | subscriptions/collections/files/artifacts/settings/tokens |
| 🔐 认证 | ✅ | Secrets Store JWT + Token 验证 |
| 🔍 解析器 | ✅ | Clash YAML · sing-box JSON · URI list · Surge/Loon/QX |
| ⚙️ 处理器 | ✅ | 17 种：dedupe · filter · rename · sort · flag · tag 等 |
| 📤 导出 | ✅ | 15 种格式：clash · sing-box · surge · loon · qx 等 |
| 🔄 刷新 | ✅ | Cron 触发 · 远程拉取 · 自动重试 |
| 💾 备份 | ✅ | 全量导出/恢复 |
| 📊 指标 | ✅ | Analytics Engine 自定义指标 |
| 🗄️ 缓存 | ✅ | KV 编译结果缓存 |
| 📁 备份存储 | ✅ | R2 大文件存储 |

### 前端 (Sub-Store-Cloudflare-Frontend)

| 页面 | 状态 | 说明 |
|------|------|------|
| 📊 Dashboard | ✅ | 概览卡片 · 快捷操作 · Worker 状态 |
| 📄 Subscriptions | ✅ | CRUD · 远程拉取 · 解析预览 · 导出 |
| 📁 Collections | ✅ | 组合管理 |
| 📂 Files | ✅ | 文件管理 |
| ⚙️ Settings | ✅ | Token 管理 · 备份恢复 · 连接配置 |
| 🔧 ProcessorBuilder | ✅ | 可视化处理器管道配置 |
| 📤 ExportPanel | ✅ | 多格式导出预览 |

---

## 🚀 部署

### 后端 Worker

1. Cloudflare Dashboard → Workers & Pages → Create → **链接 Git 仓库**
2. 选择 `Sub-Store-Cloudflare` 仓库
3. 配置：
   - **Build command**: `bash scripts/build-worker.sh`
   - **Config file**: `wrangler.jsonc`
   - **Compatibility date**: `2026-05-17`
   - **Smart placement**: 开启
4. 绑定 Secret Store：`JWT_SECRET_STORE` → `JWT_SECRET`

### 前端 Pages

1. Cloudflare Dashboard → Workers & Pages → Create → **Pages** → **Connect to Git**
2. 选择 `Sub-Store-Cloudflare-Frontend` 仓库
3. 配置：
   - **Build command**: `npm run build`
   - **Build output**: `dist`
   - **Environment variables**:
     - `NODE_VERSION` = `26.1.0`
     - `ENABLE_PNPM` = `true`
   - **Compatibility date**: `2026-05-17`
   - **Smart placement**: 开启

### 本地开发

```bash
# 后端
cd Sub-Store-Cloudflare
pnpm install
pnpm run dev          # http://localhost:3000

# 前端
cd Sub-Store-Cloudflare-Frontend
npm install
npm run dev           # http://localhost:4321
```

---

## 🔧 CF 生态集成

| 服务 | 绑定 | 用途 | 状态 |
|------|------|------|------|
| D1 | `SUB_STORE_DB` | 主数据库 | ✅ 已用 |
| Secrets Store | `JWT_SECRET_STORE` | JWT 认证 | ✅ 已用 |
| KV | `SUB_STORE_CACHE` | 编译结果缓存 | ✅ 已用 |
| R2 | `SUB_STORE_BACKUP` | 备份存储 | ✅ 已用 |
| Queues | `REFRESH_QUEUE` | 异步刷新 | ✅ 已用 |
| Workflows | `REFRESH_WORKFLOW` | 持久执行 | ✅ 已用 |
| Analytics | `ANALYTICS` | 自定义指标 | ✅ 已用 |
| Cron | — | 定时刷新 | ✅ 已用 |
| Observability | — | 日志/追踪 | ✅ 已用 |
| Browser Run | — | JS 渲染抓取 | 🔜 可选 |
| Workers AI | — | 智能标签 | 🔜 可选 |

---

## 📁 项目结构

```
Sub-Store-Cloudflare/
├── worker-rs/                 # Rust 原生 Worker
│   ├── src/
│   │   ├── lib.rs             # 入口
│   │   ├── routes.rs          # 路由定义
│   │   └── native/            # 核心模块
│   │       ├── store.rs       # D1 存储层
│   │       ├── resources.rs   # 资源 CRUD
│   │       ├── parser.rs      # 订阅解析
│   │       ├── export.rs      # 导出格式
│   │       ├── process.rs     # 处理器管道
│   │       ├── refresh.rs     # 刷新逻辑
│   │       ├── backup.rs      # 备份恢复
│   │       └── cf_integration.rs  # CF 生态集成
│   └── Cargo.toml
├── migrations/                # D1 迁移
├── scripts/                   # 构建脚本
├── wrangler.jsonc             # Worker 配置
└── package.json
```

---

## 🔄 自动更新

- **GitHub Actions** 每天 SGT 07:28 / 17:16 检查上游 Sub-Store 最新版本
- 版本变化时提交 `.upstream/*` 标记
- **Cloudflare Git Integration** 自动触发 build/deploy
- **Worker Cron** 同时间刷新已启用的订阅/组合

---

## 🛡️ 许可证

[AGPL-3.0](LICENSE)

---

<p align="center">
  <sub>Built with ☕ and Rust</sub>
</p>
