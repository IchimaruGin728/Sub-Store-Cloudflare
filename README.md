# Sub-Store Cloudflare

几年前想部署到 Workers 实现长期在线，但后续发现不支持 eval()，核心的脚本操作无法使用所以停更了。

如果你需要一个仅仅是用于订阅转换的工具，不需要脚本功能，并且可以持续在线，那么这个项目可能适合你。

在 Cloudflare Workers 上运行 Sub-Store。

## 特性

- ✅ 使用 Durable Objects (SQLite) 持久化存储
- ✅ Cron Triggers 定时同步
- ✅ 不修改 Sub-Store 源代码
- ✅ GitHub Actions 自动同步并部署 Sub-Store 前后端
- ✅ 前端 release 自动打上 Cloudflare 版品牌
- ✅ 每天 SGT 07:28 / 17:16 自动检查更新并部署

### 为什么从 D1 换到 Durable Objects

Workers 会在多实例下并发处理请求。为了兼容 Sub-Store 的原有存储模型（单用户数据聚合在一条记录中），同一时刻多个请求对同一用户执行“读-改-写”时，若没有额外的版本控制/锁机制，在 D1 中容易出现后写覆盖先写（丢更新）。Durable Objects 按 Object ID 提供单活实例与串行处理能力，更适合这种高冲突写入场景，因此能更稳地保证单用户数据一致性。

---

## ⚠️ 功能限制

> [!CAUTION]
> **脚本相关操作**：
> 
> 本项目通过 **QuickJS (WASM)** 为 Sub-Store 的「脚本过滤/脚本操作」提供兼容实现（实验性）。
> - ✅ 支持 `async/await`（通过 QuickJS Promise + pendingJobs 驱动）
> - ✅ 默认启用 CPU/内存/栈限制，避免脚本无限循环/内存失控
> - ⚠️ 仍属于兼容层能力：与 Node 环境不等价，不支持 `require`/本地文件等
> - ⚠️ 大脚本/大数据会有额外开销（需要在宿主与 QuickJS 之间做数据序列化/复制）
> 
> 如遇到部分脚本功能无法使用，请查看 [Sub-Store 相关教程](https://xream.notion.site/Sub-Store-abe6a96944724dc6a36833d5c9ab7c87) 将其部署到 VPS/Docker 运行

- **脚本**：QuickJS 兼容实现
- **GeoIP**: 已实现，需要在仪表盘配置 mmdb 文件 URL
- **代理请求**: 不可用，但也不需要
- **推送通知**: shoutrrr 不可用，可以使用其他方式 Bark、Pushover

---

## 🚀 快速部署

> [!NOTE]
> 部署过程完全通过 GitHub 网页操作，**无需修改任何代码文件**。
> 
> 每次部署自动从官方仓库拉取最新版本：
> - 后端：[sub-store-org/Sub-Store](https://github.com/sub-store-org/Sub-Store)（从源码编译，适配 Workers 环境）
> - 前端：[sub-store-org/Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End)（直接使用 release 的 dist.zip）

### 第一步：准备仓库

建议作为独立仓库维护，例如 `sub-store-cloudflare`。如果当前仓库来自 fork，可以在 GitHub 上新建同名独立仓库后推送当前代码。

### 第二步：Cloudflare Pages 项目（前端）

工作流会自动检查并创建 Pages 项目。默认项目名是 `sub-store-frontend`，也可以在 GitHub Actions repository variables 中设置 `FRONTEND_PAGES_PROJECT` 覆盖。

### 第三步：获取 Cloudflare API Token

1. 访问 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Custom token**，配置权限：
   - Account → Workers Scripts → Edit
   - Account → Cloudflare Pages → Edit
4. 创建并**复制 Token**

### 第四步：获取 Account ID

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 右侧会显示 **Account ID**，复制它

### 第五步：配置 GitHub Secrets

在你 Fork 的仓库中：

1. 点击 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，添加以下配置：

| Secret 名称 | 说明 | 示例 |
|-------------|------|------|
| `CF_API_TOKEN` | Cloudflare API Token | `xxxxxxxxx` |
| `CF_ACCOUNT_ID` | Cloudflare Account ID | `xxxxxxxxx` |
| `JWT_SECRET` | JWT 签名密钥（必填，建议 32 位以上随机字符串） | `your-long-random-secret` |
可选 repository variable：

| Variable 名称 | 说明 | 默认值 |
|---------------|------|--------|
| `FRONTEND_PAGES_PROJECT` | Cloudflare Pages 项目名 | `sub-store-frontend` |

### 第六步：触发部署

1. 点击仓库的 **Actions** 标签
2. 选择 **Deploy to Cloudflare**
3. 点击 **Run workflow** → **Run workflow**

部署完成后：
- 后端：`https://sub-store.<your-subdomain>.workers.dev` 或你的域名
- 前端：请到你的 Cloudflare Pages 项目中查看并绑定域名
- 控制台：`你的后端域名/dashboard/`

---

## 👥 多用户管理

首次部署后，访问 `后端域名/dashboard/` 进入管理面板。

初始管理员用户名：admin
初始管理员密码：admin

登录后请立即更改用户名密码

每个用户拥有独立的 Sub-Store 空间，互不干扰。

---

## 🔄 自动更新

配置完成后，GitHub Actions 会：

- 每天 **SGT 07:28 / 17:16** 自动检查 Sub-Store 官方仓库是否有新版本
- 如果有更新，自动部署新版本
- 前端会从官方 release 同步，然后部署前自动替换为 Cloudflare 版 PWA 名称与图标
- 无需任何手动操作

你也可以随时通过 Actions → Run workflow 手动触发部署。

---

## 🛠️ 本地开发

### 前置要求

- bun
- pnpm

### 快速开始

需要先下载 Sub-Store 源码到 `sub-store` 目录并且安装依赖

```bash
# 安装项目依赖
bun install

# 下载 Sub-Store 源码
bun run fetch:substore

# 安装 Sub-Store 依赖
bun run install:backend

# 启动开发服务器
bun run dev

# 编译
bun run build

# 预览(使用与 Workers 相同的环境)
bun run preview
```

访问 http://localhost:3000 测试

### 可用命令

| 命令 | 说明 |
|------|------|
| `bun run build` | 构建 |
| `bun run dev` | 本地开发服务器 |
| `bun run deploy:local` | 从本地部署到 Cloudflare |
| `bun run deploy:action` | 从 GitHub Actions 部署到 Cloudflare |
| `bun run install:backend` | 安装 Sub-Store 后端依赖 |
| `bun run fetch:substore` | 下载 Sub-Store 源码 |
| `bun run tail` | 实时查看 Cloudflare Worker 生产环境的日志 |
| `bun run prepare:quickjs-wasm` | 准备 QuickJS WASM | 
| `node scripts/brand-frontend-dist.js <dist>` | 给官方前端 dist 打 Cloudflare 版品牌 |

---

## 故障排除

### 订阅下载超时

Workers HTTP 请求超时为 10-55 秒。如果目标服务器响应慢，可能会超时。

---

## License

[AGPL-3.0](LICENSE)
