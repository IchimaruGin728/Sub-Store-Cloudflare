# Sub-Store Cloudflare

几年前想部署到 Workers 实现长期在线，但后续发现不支持 eval()，核心的脚本操作无法使用所以停更了。

如果你需要一个仅仅是用于订阅转换的工具，不需要脚本功能，并且可以持续在线，那么这个项目可能适合你。

在 Cloudflare Workers 上运行 Sub-Store Cloudflare，并逐步迁移到 `worker-rs` 原生 Rust 实现。

> [!IMPORTANT]
> 项目方向已经调整为 **单用户、Cloudflare-native、独立实现**。当前部署入口已经切到 `worker-rs`，前端/dashboard 和旧 JS compatibility Worker 已经移除。详细路线见 [Cloudflare Native Rewrite](docs/CLOUDFLARE_NATIVE_REWRITE.md)。

## 特性

- ✅ 根目录只保留一个 `wrangler.jsonc`
- ✅ Cloudflare Git build 直接构建 `worker-rs`
- ✅ GitHub Actions 只监测上游 latest，不直接部署
- ✅ Workers 由 Cloudflare Git 集成 build/deploy，使用 Cloudflare 构建额度
- ✅ 前端/dashboard 代码已删除，后续按自用 API 重新实现
- ✅ 后端对外识别为 Cloudflare Workers，不再显示 Surge
- ✅ `worker-rs/` 原生 Rust Worker 路线已成为当前部署入口
- ✅ 每天 SGT 07:28 / 17:16 自动检查上游更新

### 当前状态存储

当前实现优先使用 D1：`subscriptions`、`collections`、`files`、`artifacts`、`settings`、`tokens` 都是 D1 中的 first-class records。后续如果出现需要串行化的高冲突任务队列，再把 refresh/job coordination 放到 Durable Objects 或 Workflows。

---

## ⚠️ 功能限制

- **worker-rs**: 当前部署入口，覆盖 env/status/health、资源 CRUD、保存订阅导出、artifact materialize、远程订阅拉取、解析、处理器和多软件导出。
- **Sub-Store 核心功能**: 订阅/组合/文件/artifact/settings/tokens 已按 Rust 原生模型重写；复杂脚本操作继续用 typed Rust operators 替代。
- **QuickJS/Vite/官方前端**: 已从当前项目移除，不参与 build/deploy。

---

## 🚀 快速部署

> [!NOTE]
> GitHub Actions 只负责监测官方 latest release，不再直接部署。Workers 交给 Cloudflare 绑定 Git 仓库后自行 build/deploy。
> 
> GitHub Actions 仍会记录官方最新版本，供后续 Rust parity 测试参考。

### 第一步：准备仓库

建议作为独立仓库维护，例如 `Sub-Store-Cloudflare`。

### 第二步：Cloudflare 绑定 Git 仓库

在 Cloudflare Dashboard 中创建/绑定：

- Worker：绑定这个 GitHub repo，生产分支选择 `main`

推荐项目名都用 `sub-store-cloudflare`。

### 第三步：Cloudflare Build 配置

Workers build：

- Build command: `bash scripts/build-worker.sh`
- Deploy command: Cloudflare Workers Git 集成默认部署当前 Worker 项目
- Config file: `wrangler.jsonc`
- Secret Store：`JWT_SECRET_STORE` 绑定到 `default_secrets_store` 里的 `JWT_SECRET`
- Fallback：本地开发可在 `.dev.vars` 里临时设置 `JWT_SECRET`

### 第四步：GitHub Actions 监测

Actions 会在 SGT 每天 `07:28` 和 `17:16` 检查上游 latest release。发现版本变化时，它只更新并提交：

- `.upstream/backend-version`
- `.upstream/frontend-version`
- `.upstream/metadata.json`

Cloudflare 的 Git 集成检测到这个提交后，使用自己的构建额度重新 build/deploy。

部署完成后：
- 后端：`https://sub-store-cloudflare.<your-subdomain>.workers.dev` 或你的域名

---

## 🔄 自动更新

配置完成后，GitHub Actions 会：

- 每天 **SGT 07:28 / 17:16** 自动检查 Sub-Store 官方仓库是否有新版本
- 如果有更新，只提交 `.upstream/*` 版本标记
- Cloudflare Git 集成检测到提交后自行 build/deploy

你也可以随时通过 Actions → Run workflow 手动触发检查。

---

## 🛠️ 本地开发

### 前置要求

- Node.js
- pnpm

### 快速开始

```bash
# 安装项目依赖（package.json 里的依赖版本全部使用 latest）
pnpm install

# 启动开发服务器
pnpm run dev

# 编译
pnpm run build

# 本地部署
pnpm run deploy:local
```

访问 http://localhost:3000 测试

### 可用命令

| 命令 | 说明 |
|------|------|
| `pnpm run build` | 构建 |
| `pnpm run build:worker` | Cloudflare Workers Git build 使用的后端构建 |
| `pnpm run dev` | 本地开发服务器 |
| `pnpm run deploy:local` | 从本地部署到 Cloudflare |
| `pnpm run tail` | 实时查看 Cloudflare Worker 生产环境的日志 |

---

## 故障排除

### 订阅下载超时

Workers HTTP 请求超时为 10-55 秒。如果目标服务器响应慢，可能会超时。

---

## License

[AGPL-3.0](LICENSE)
