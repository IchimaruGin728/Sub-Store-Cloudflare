#!/usr/bin/env node
/**
 * Sub-Store Workers 构建脚本
 * 使用 esbuild 打包 Sub-Store 并进行必要的代码转换
 */

import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sub-Store 源码路径
const SUB_STORE_PATH = path.join(__dirname, 'sub-store/backend');

/**
 * 创建替换插件
 * 用于替换 eval(require(...)) 等 Node.js 特定代码
 */
function createReplacePlugin() {
    return {
        name: 'replace-node-code',
        setup(build) {
            // 处理 .js 文件
            build.onLoad({ filter: /\.js$/ }, async (args) => {
                // 只处理 Sub-Store 源码
                if (!args.path.includes('backend/src')) {
                    return null;
                }

                let contents = await fs.promises.readFile(args.path, 'utf8');

                // 替换 eval(require(...)) 模式
                // 例如: eval(`require("dotenv")`) -> ({ config: () => {} })
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]dotenv['"`]\s*\)['"`]\s*\)/g,
                    '({ config: () => {} })'
                );

                // 替换 fs 相关的 eval
                contents = contents.replace(
                    /eval\s*\(\s*["'`]require\s*\(\s*['"`]fs['"`]\s*\)["'`]\s*\)/g,
                    'globalThis.__fs_shim__'
                );

                // 替换 path 相关的 eval
                contents = contents.replace(
                    /eval\s*\(\s*["'`]require\s*\(\s*['"`]path['"`]\s*\)["'`]\s*\)/g,
                    'globalThis.__path_shim__'
                );

                // 替换 undici 相关的 eval - Workers 使用原生 fetch
                contents = contents.replace(
                    /eval\s*\(\s*["'`]require\s*\(\s*['"`]undici['"`]\s*\)["'`]\s*\)/g,
                    '({ request: globalThis.fetch, Agent: class {}, ProxyAgent: class {}, EnvHttpProxyAgent: class {} })'
                );

                // 替换 fetch-socks - Workers 不支持 SOCKS 代理
                contents = contents.replace(
                    /eval\s*\(\s*["'`]require\s*\(\s*['"`]fetch-socks['"`]\s*\)["'`]\s*\)/g,
                    '({ socksDispatcher: () => null })'
                );

                // 替换 express - Workers 使用自己的路由
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]express['"`]\s*\)['"`]\s*\)/g,
                    'null'
                );

                // 替换 body-parser
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]body-parser['"`]\s*\)['"`]\s*\)/g,
                    '({ json: () => (req, res, next) => next(), urlencoded: () => (req, res, next) => next(), raw: () => (req, res, next) => next() })'
                );

                // 替换 cron - Workers 使用 Cron Triggers
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]cron['"`]\s*\)['"`]\s*\)/g,
                    '({ CronJob: class { constructor() {} } })'
                );

                // 替换 child_process（用于推送通知）
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]child_process['"`]\s*\)['"`]\s*\)/g,
                    '({ execFile: () => {} })'
                );

                // 替换 connect-history-api-fallback
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]connect-history-api-fallback['"`]\s*\)['"`]\s*\)/g,
                    '(() => (req, res, next) => next())'
                );

                // 替换 http-proxy-middleware
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]http-proxy-middleware['"`]\s*\)['"`]\s*\)/g,
                    '({ createProxyMiddleware: () => (req, res, next) => next() })'
                );

                // 替换 mime-types
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]mime-types['"`]\s*\)['"`]\s*\)/g,
                    '({ contentType: () => "text/plain" })'
                );

                // 替换 ms
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]ms['"`]\s*\)['"`]\s*\)/g,
                    'globalThis.__ms_shim__'
                );

                // 替换 nanoid
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]nanoid['"`]\s*\)['"`]\s*\)/g,
                    '({ nanoid: (size = 21) => crypto.randomUUID().replace(/-/g, "").slice(0, size) })'
                );

                // 替换 @maxmind/geoip2-node - 使用我们的 stub
                contents = contents.replace(
                    /eval\s*\(\s*['"`]require\s*\(\s*['"`]@maxmind\/geoip2-node['"`]\s*\)['"`]\s*\)/g,
                    '({ Reader: { openBuffer: () => ({ country: () => null, asn: () => null }) } })'
                );

                // 替换 stream/promises
                contents = contents.replace(
                    /eval\s*\(\s*["'`]require\s*\(\s*['"`]stream\/promises['"`]\s*\)["'`]\s*\)/g,
                    'globalThis.__stream_promises_shim__'
                );


                // 修改 isNode 检测，让它返回 false (模拟 Surge 环境)
                // Cloudflare Workers 禁止 eval()，Node 模式会触发很多 eval 调用
                contents = contents.replace(
                    /const\s+isNode\s*=\s*eval\s*\(\s*['\"`]typeof\s+process\s*!==\s*[\"']undefined[\"]['\"`]\s*\)/g,
                    'const isNode = false'
                );

                // 关键：硬编码 isSurge = true (因为模块加载时 $httpClient 可能还未设置)
                contents = contents.replace(
                    /const\s+isSurge\s*=\s*typeof\s+\$httpClient\s*!==\s*['\"]undefined['\"]\s*&&\s*!isLoon\s*;/g,
                    'const isSurge = true;'
                );

                // 关键修改：修改 express.js 中的 app.start
                // 原代码: app.start = () => { dispatch($request); };
                // 修改为: 暴露 dispatch 到全局，每次请求都可以调用
                if (args.path.includes('vendor/express.js')) {
                    contents = contents.replace(
                        /app\.start\s*=\s*\(\)\s*=>\s*\{\s*dispatch\s*\(\s*\$request\s*\)\s*;\s*\}/g,
                        `app.start = () => {
                            // 暴露 dispatch 到全局，供 Workers 重复调用
                            globalThis.__substore_dispatch__ = dispatch;
                            // 首次调用
                            dispatch($request);
                        }`
                    );
                }

                return {
                    contents,
                    loader: 'js',
                };
            });
        },
    };
}


async function main() {
    console.log('Building Sub-Store for Cloudflare Workers...');

    // 检查 Sub-Store 源码是否存在
    const mainFile = path.join(SUB_STORE_PATH, 'src/main.js');
    if (!fs.existsSync(mainFile)) {
        console.error(`Error: Sub-Store source not found at ${mainFile}`);
        console.error('Please ensure the backend folder exists in the parent directory.');
        process.exit(1);
    }

    // 读取版本号
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(SUB_STORE_PATH, 'package.json'), 'utf8')
    );
    const version = packageJson.version;

    console.log(`Sub-Store version: ${version}`);

    // 第一步：打包 Sub-Store 源码并进行替换
    console.log('Step 1: Bundling Sub-Store source code...');

    await build({
        entryPoints: [mainFile],
        bundle: true,
        minify: false, // 先不压缩，便于调试
        sourcemap: false,
        platform: 'browser',
        format: 'iife',
        target: 'es2022',
        outfile: path.join(__dirname, 'src/sub-store-bundle.js'),
        plugins: [createReplacePlugin()],
        // 从 backend/node_modules 解析依赖
        nodePaths: [path.join(SUB_STORE_PATH, 'node_modules')],
        // 别名路径解析
        alias: {
            '@': path.join(SUB_STORE_PATH, 'src'),
        },
        banner: {
            js: `// Sub-Store Workers Bundle v${version}\n// Generated at ${new Date().toISOString()}\n
export function initSubStore() {
`,
        },
        footer: {
            js: `\n}`,
        },
        // 忽略一些警告
        logLevel: 'warning',
    });

    console.log('Step 2: Building Dashboard frontend...');

    // 第二步：编译 Dashboard 前端 (JSX -> JS)
    // 清理旧的 assets 文件
    const assetsDir = path.join(__dirname, 'public/dashboard/assets');
    if (fs.existsSync(assetsDir)) {
        const oldFiles = fs.readdirSync(assetsDir).filter(f => f.startsWith('app-') && f.endsWith('.js'));
        oldFiles.forEach(f => fs.unlinkSync(path.join(assetsDir, f)));
    } else {
        fs.mkdirSync(assetsDir, { recursive: true });
    }

    const result = await build({
        entryPoints: [path.join(__dirname, 'src/dashboard/frontend/app.jsx')],
        bundle: true,
        minify: true,
        sourcemap: false,
        platform: 'browser',
        format: 'iife',
        target: 'es2020',
        outdir: assetsDir,
        entryNames: '[name]-[hash]',
        loader: { '.jsx': 'jsx' },
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"' },
        metafile: true,
    });

    // 从 metafile 中获取生成的文件名
    const outputs = Object.keys(result.metafile.outputs);
    const appJsFile = outputs.find(f => f.includes('/app-') && f.endsWith('.js'));
    const appJsName = appJsFile ? path.basename(appJsFile) : 'app.js';

    // 复制 HTML 文件并替换资源路径
    let htmlContent = fs.readFileSync(
        path.join(__dirname, 'src/dashboard/frontend/index.html'),
        'utf8'
    );
    htmlContent = htmlContent.replace('/dashboard/assets/app.js', `/dashboard/assets/${appJsName}`);
    fs.writeFileSync(
        path.join(__dirname, 'public/dashboard/index.html'),
        htmlContent
    );

    console.log('Step 3: Bundling Workers entry point...');

    // 第三步：打包 Workers 入口
    await build({
        entryPoints: [path.join(__dirname, 'src/index.js')],
        bundle: true,
        minify: true,
        sourcemap: false,
        platform: 'browser',
        format: 'esm',
        target: 'es2022',
        outfile: path.join(__dirname, 'dist/worker.js'),
        plugins: [],
        loader: {
            '.html': 'text',
            '.txt': 'text',
        },
        external: [
            'node:async_hooks',
            'node:path',
            'node:stream',
            'node:stream/promises',
            'node:buffer'
        ], // 标记为外部依赖，由 Workers Runtime 提供
        banner: {
            js: `// Sub-Store Cloudflare Workers v${version}\n`,
        },
    });

    console.log('Build completed!');
    console.log(`Output: ${path.join(__dirname, 'dist/worker.js')}`);
}

main().catch((err) => {
    console.error('Build failed:', err);
    process.exit(1);
});
