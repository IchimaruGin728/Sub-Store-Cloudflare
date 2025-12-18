# Sub-Store Workers

几年前想部署到 Workers 实现长期在线，但后续发现不支持 eval()，核心的脚本操作无法使用所以停更了。

如果你需要一个仅仅是用于订阅转换的工具，不需要脚本功能，并且可以持续在线，那么这个项目可能适合你。

在 Cloudflare Workers 上运行 Sub-Store。

## 特性

- ✅ 使用 D1 数据库持久化存储
- ✅ Cron Triggers 定时同步
- ✅ 不修改 Sub-Store 源代码
- ✅ GitHub Actions 自动部署（前后端）
- ✅ 每 3 天自动检查更新并部署

---

## ⚠️ 功能限制

> [!CAUTION]
> **脚本相关操作**：由于 Cloudflare Workers 禁止 `eval()` 和 `new Function()`，**无法使用任何自定义脚本功能**。
> 
> 如需使用脚本功能，请查看 [Sub-Store 相关教程](https://xream.notion.site/Sub-Store-abe6a96944724dc6a36833d5c9ab7c87) 将其部署到 VPS/Docker 运行

- **脚本**：不可用
- **GeoIP**: 不可用
- **代理请求**: 不可用，但也不需要
- **推送通知**: shoutrrr 不可用，可以使用其他方式

---

## 🚀 快速部署

> [!NOTE]
> 部署过程完全通过 GitHub 网页操作，**无需修改任何代码文件**。
> 
> 每次部署自动从官方仓库拉取最新版本：
> - 后端：[sub-store-org/Sub-Store](https://github.com/sub-store-org/Sub-Store)（从源码编译，适配 Workers 环境）
> - 前端：[sub-store-org/Sub-Store-Front-End](https://github.com/sub-store-org/Sub-Store-Front-End)（直接使用 release 的 dist.zip）

### 第一步：Fork 仓库

点击 GitHub 页面右上角的 **Fork** 按钮，将仓库复制到你的账号。

### 第二步：创建 D1 数据库

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 左侧菜单选择 **Workers & Pages** → **D1**
3. 点击 **Create database**
4. 输入名称 `sub-store-db`，点击 **Create**
5. **复制显示的 Database ID**（类似 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`）

> [!TIP]
> 数据库表会在首次部署时自动创建，无需手动初始化。

### 第三步：创建 Cloudflare Pages 项目（前端）

如果你想直接使用官方前端，可以跳过此步骤，并且后面的 GitHub Secrets 中的 `DEPLOY_SUB_STORE_FRONTEND` 也无需设置。

1. 在 Cloudflare Dashboard 选择 **Workers & Pages**
2. 点击 **Create** → **Pages** → **Direct Upload**
3. 项目名称填 `sub-store-frontend`
4. 随便上传一个文件完成创建（后续会自动部署）

### 第四步：获取 Cloudflare API Token

1. 访问 [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. 点击 **Create Token**
3. 选择 **Custom token**，配置权限：
   - Account → Workers Scripts → Edit
   - Account → D1 → Edit
   - Account → Cloudflare Pages → Edit
4. 创建并**复制 Token**

### 第五步：获取 Account ID

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 右侧会显示 **Account ID**，复制它

### 第六步：配置 GitHub Secrets

在你 Fork 的仓库中：

1. 点击 **Settings** → **Secrets and variables** → **Actions**
2. 点击 **New repository secret**，添加以下配置：

| Secret 名称 | 说明 | 示例 |
|-------------|------|------|
| `CF_API_TOKEN` | Cloudflare API Token | `xxxxxxxxx` |
| `CF_ACCOUNT_ID` | Cloudflare Account ID | `xxxxxxxxx` |
| `D1_DATABASE_ID` | D1 数据库 ID | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `DEPLOY_SUB_STORE_FRONTEND` | 是否部署 Sub-Store 前端 (可选，任意值为部署，不设置该变量则不部署前端) | `true` |

### 第七步：触发部署

1. 点击仓库的 **Actions** 标签
2. 选择 **Deploy to Cloudflare**
3. 点击 **Run workflow** → **Run workflow**

部署完成后：
- 后端：`https://sub-store.<your-subdomain>.workers.dev` 或你的域名
- 前端：请到你的 Cloudflare Pages 项目中查看并绑定域名
- 控制台：`你的后端域名/dashboard/`

---

## 👥 多用户管理

首次部署后，访问 `/dashboard/` 进入管理面板。

初始管理员用户名：admin
初始管理员密码：admin

登录后请立即更改用户名密码

每个用户拥有独立的 Sub-Store 空间，互不干扰。

---

## 🔄 自动更新

配置完成后，GitHub Actions 会：

- **每 3 天**自动检查 Sub-Store 官方仓库是否有新版本
- 如果有更新，自动部署新版本
- 无需任何手动操作

你也可以随时通过 Actions → Run workflow 手动触发部署。

---

## 🛠️ 本地开发

### 前置要求

- bun

### 快速开始

需要先下载 Sub-Store 源码到 `sub-store` 目录并且安装依赖 `cd sub-store/backend && pnpm install`

```bash
# 安装依赖
bun install

# 初始化本地数据库
bun run db:init:local

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
| `bun run db:create` | 创建数据库 |
| `bun run db:init:local` | 初始化本地数据库 |
| `bun run db:init:remote` | 初始化远程数据库 |
| `bun run deploy:local` | 从本地部署到 Cloudflare |
| `bun run deploy:action` | 从 GitHub Actions 部署到 Cloudflare |
| `bun run tail` | 实时查看 Cloudflare Worker 生产环境的日志 |

---

## 故障排除

### 数据库错误

数据库表会在首次部署时自动创建。如果仍然报错，可以在 D1 Console 手动执行 `schema.sql` 的内容。

### 订阅下载超时

Workers HTTP 请求超时为 10-55 秒。如果目标服务器响应慢，可能会超时。

---

## License

GPL-3.0
