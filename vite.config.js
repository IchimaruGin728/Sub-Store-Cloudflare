/**
 * Sub-Store Workers - Vite 配置
 * 
 * 重要说明：
 * Cloudflare Vite 插件会自动处理 Worker 入口和静态资源。
 * 但 Sub-Store 源码需要特殊的代码替换处理。
 */
import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Sub-Store 源码路径
const SUB_STORE_PATH = path.join(__dirname, 'sub-store/backend');

/**
 * Sub-Store 代码替换插件
 * 替换 Node.js 特有代码为 Workers 兼容的 shim
 */
function subStoreTransformPlugin() {
    return {
        name: 'sub-store-transform',
        enforce: 'pre',
        transform(code, id) {
            // 只处理 Sub-Store backend 源码
            if (!id.includes('sub-store/backend/src')) {
                return null;
            }

            let contents = code;

            // ============ Node.js 模块替换 ============

            // dotenv
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]dotenv['"`]\s*\)['"`]\s*\)/g,
                '({ config: () => {} })'
            );

            // fs
            contents = contents.replace(
                /eval\s*\(\s*["'`]require\s*\(\s*['"`]fs['"`]\s*\)["'`]\s*\)/g,
                'globalThis.__fs_shim__'
            );

            // path
            contents = contents.replace(
                /eval\s*\(\s*["'`]require\s*\(\s*['"`]path['"`]\s*\)["'`]\s*\)/g,
                'globalThis.__path_shim__'
            );

            // undici - Workers 使用原生 fetch
            contents = contents.replace(
                /eval\s*\(\s*["'`]require\s*\(\s*['"`]undici['"`]\s*\)["'`]\s*\)/g,
                '({ request: globalThis.fetch, Agent: class {}, ProxyAgent: class {}, EnvHttpProxyAgent: class {} })'
            );

            // fetch-socks - Workers 不支持 SOCKS
            contents = contents.replace(
                /eval\s*\(\s*["'`]require\s*\(\s*['"`]fetch-socks['"`]\s*\)["'`]\s*\)/g,
                '({ socksDispatcher: () => null })'
            );

            // express
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]express['"`]\s*\)['"`]\s*\)/g,
                'null'
            );

            // body-parser
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]body-parser['"`]\s*\)['"`]\s*\)/g,
                '({ json: () => (req, res, next) => next(), urlencoded: () => (req, res, next) => next(), raw: () => (req, res, next) => next() })'
            );

            // cron
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]cron['"`]\s*\)['"`]\s*\)/g,
                '({ CronJob: class { constructor() {} } })'
            );

            // child_process
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]child_process['"`]\s*\)['"`]\s*\)/g,
                '({ execFile: () => {} })'
            );

            // connect-history-api-fallback
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]connect-history-api-fallback['"`]\s*\)['"`]\s*\)/g,
                '(() => (req, res, next) => next())'
            );

            // http-proxy-middleware
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]http-proxy-middleware['"`]\s*\)['"`]\s*\)/g,
                '({ createProxyMiddleware: () => (req, res, next) => next() })'
            );

            // mime-types
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]mime-types['"`]\s*\)['"`]\s*\)/g,
                '({ contentType: () => "text/plain" })'
            );

            // ms
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]ms['"`]\s*\)['"`]\s*\)/g,
                'globalThis.__ms_shim__'
            );

            // nanoid
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]nanoid['"`]\s*\)['"`]\s*\)/g,
                '({ nanoid: (size = 21) => crypto.randomUUID().replace(/-/g, "").slice(0, size) })'
            );

            // @maxmind/geoip2-node
            contents = contents.replace(
                /eval\s*\(\s*['"`]require\s*\(\s*['"`]@maxmind\/geoip2-node['"`]\s*\)['"`]\s*\)/g,
                '({ Reader: { openBuffer: () => ({ country: () => null, asn: () => null }) } })'
            );

            // stream/promises
            contents = contents.replace(
                /eval\s*\(\s*["'`]require\s*\(\s*['"`]stream\/promises['"`]\s*\)["'`]\s*\)/g,
                'globalThis.__stream_promises_shim__'
            );

            // ============ 环境检测修改 ============

            // 修改 isNode 检测，让它返回 false (模拟 Surge 环境)
            // Cloudflare Workers 禁止 eval()，Node 模式会触发很多 eval 调用
            contents = contents.replace(
                /const\s+isNode\s*=\s*eval\s*\(\s*['"`]typeof\s+process\s*!==\s*['"]undefined['"]['"`]\s*\)/g,
                'const isNode = false'
            );

            // 硬编码 isSurge = true (因为模块加载时 $httpClient 可能还未设置)
            contents = contents.replace(
                /const\s+isSurge\s*=\s*typeof\s+\$httpClient\s*!==\s*['"]undefined['"]\s*&&\s*!isLoon\s*;/g,
                'const isSurge = true;'
            );

            // ============ express.js 修改 ============

            // 暴露 dispatch 到全局，供 Workers 重复调用
            if (id.includes('vendor/express.js')) {
                contents = contents.replace(
                    /app\.start\s*=\s*\(\)\s*=>\s*\{\s*dispatch\s*\(\s*\$request\s*\)\s*;\s*\}/g,
                    `app.start = () => {
                        globalThis.__substore_dispatch__ = dispatch;
                        dispatch($request);
                    }`
                );
            }

            // ============ open-api.js 修改：请求级缓存隔离 ============
            if (id.includes('vendor/open-api.js')) {
                // 注入获取当前请求 ID 的辅助函数
                // 在 OpenAPI 类之前注入
                if (contents.includes('export class OpenAPI')) {
                    contents = contents.replace(
                        'export class OpenAPI',
                        `// 获取当前请求的缓存（请求级隔离）
function __getRequestCache__() {
    const requestId = globalThis.__current_request_id__;
    if (globalThis.__substore_request_caches__ && requestId !== undefined) {
        return globalThis.__substore_request_caches__.get(requestId) || {};
    }
    return {};
}

// 设置当前请求的缓存
function __setRequestCache__(key, value) {
    const requestId = globalThis.__current_request_id__;
    if (globalThis.__substore_request_caches__ && requestId !== undefined) {
        const cache = globalThis.__substore_request_caches__.get(requestId) || {};
        cache[key] = value;
        globalThis.__substore_request_caches__.set(requestId, cache);
    }
}

export class OpenAPI`
                    );
                }

                // 替换 initCache 中对 this.cache 的赋值（跳过，因为我们在 substore.js 中初始化）
                contents = contents.replace(
                    /this\.cache\s*=\s*JSON\.parse\s*\(\s*\$persistentStore\.read\s*\(\s*this\.name\s*\)\s*\|\|\s*'{}'\s*\)/g,
                    'this.cache = __getRequestCache__()'
                );

                // 替换 persistCache 中对 this.cache 的读取
                contents = contents.replace(
                    /const\s+data\s*=\s*JSON\.stringify\s*\(\s*this\.cache\s*,\s*null\s*,\s*2\s*\)/g,
                    'const data = JSON.stringify(__getRequestCache__(), null, 2)'
                );

                // 替换 write 方法中对 this.cache[key] 的赋值
                contents = contents.replace(
                    /this\.cache\[key\]\s*=\s*data;/g,
                    '__setRequestCache__(key, data);'
                );

                // 替换 read 方法中对 this.cache[key] 的读取
                contents = contents.replace(
                    /return\s+this\.cache\[key\];/g,
                    'return __getRequestCache__()[key];'
                );

                // 替换 delete 方法中对 this.cache 的删除
                contents = contents.replace(
                    /delete\s+this\.cache\[key\];/g,
                    'const __cache__ = __getRequestCache__(); delete __cache__[key];'
                );
            }

            if (contents !== code) {
                return { code: contents, map: null };
            }
            return null;
        }
    };
}

export default defineConfig({
    plugins: [
        // React JSX 支持 (Dashboard 前端)
        react(),
        // Sub-Store 代码替换
        subStoreTransformPlugin(),
        // Cloudflare Workers 适配
        cloudflare()
    ],
    resolve: {
        alias: {
            // Sub-Store 源码路径别名
            '@': path.join(SUB_STORE_PATH, 'src')
        }
    },
    environments: {
        client: {
            build: {
                assetsDir: 'dashboard/assets',
                rollupOptions: {
                    input: {
                        dashboard: path.join(__dirname, 'dashboard/index.html')
                    },
                }
            }
        }
    },
    // 优化依赖预打包
    optimizeDeps: {
        include: ['react', 'react-dom', 'jose']
    },
    // 开发服务器配置
    server: {
        cors: {
            origin: '*',
            methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
            credentials: true,
        },
    },
});
