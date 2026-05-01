/**
 * Sub-Store Cloudflare - Vite 配置
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
    // fail-fast：关键运行时补丁必须命中
    let expressPatchApplied = 0;
    let expressFileSeen = false;
    let openApiPatchApplied = 0;
    let openApiFileSeen = false;
    // fail-fast 统计：download.js 补丁必须命中且只命中一次
    let downloadPatchApplied = 0;
    let downloadFileSeen = false;

    // fail-fast 统计：processors/index.js 脚本执行补丁必须命中且只命中一次
    let processorsPatchApplied = 0;
    let processorsFileSeen = false;

    // fail-fast：core/app.js OpenAPI debug 开关补丁
    let openApiDebugPatchApplied = 0;
    let openApiDebugFileSeen = false;

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
                /const\s+isNode\s*=\s*eval\s*\(\s*`typeof\s+process\s*!==\s*"undefined"`\s*\)/g,
                'const isNode = false'
            );

            // 硬编码 isSurge = true (因为模块加载时 $httpClient 可能还未设置)
            contents = contents.replace(
                /const\s+isSurge\s*=\s*typeof\s+\$httpClient\s*!==\s*['"]undefined['"]\s*&&\s*!isLoon\s*;/g,
                'const isSurge = true;'
            );

            // ============ express.js 修改 ============

            // 暴露 dispatch 到全局，供 Workers 重复调用
            // 注意：不在 start() 中调用 dispatch()，因为这会在模块导入期间触发
            // Workers 禁止在模块导入期间执行 fetch/setTimeout 等异步操作
            if (id.includes('vendor/express.js')) {
                expressFileSeen = true;
                const before = contents;
                contents = contents.replace(
                    /app\.start\s*=\s*\(\)\s*=>\s*\{\s*dispatch\s*\(\s*\$request\s*\)\s*;\s*\}/g,
                    `app.start = () => {
                        // __SUB_STORE_WORKERS_PATCH__DISPATCH_EXPORT__
                        globalThis.__substore_dispatch__ = dispatch;
                        // dispatch 将在模块完全加载后由 substore-loader.js 调用
                    }`
                );
                if (contents !== before) {
                    expressPatchApplied += 1;
                    // 自检：必须出现 marker
                    if (!contents.includes('__SUB_STORE_WORKERS_PATCH__DISPATCH_EXPORT__')) {
                        this.error('[sub-store-transform] express.js 补丁自检失败：缺少 marker');
                    }
                } else {
                    // upstream 结构变化或已不含预期片段，直接 fail-fast
                    this.error('[sub-store-transform] express.js 补丁未应用：未命中 app.start/dispatch($request) 片段');
                }
            }

            // ============ open-api.js 修改：请求级缓存隔离 ============
            if (id.includes('vendor/open-api.js')) {
                openApiFileSeen = true;
                const beforeOpenApi = contents;

                // fail-fast: 如果 upstream 仍然用 eval()/Surge 探测片段，则必须被全局补丁替换
                //（上面全局内容替换已覆盖绝大多数文件，这里只做“需要时才强制”的自检，避免 upstream 结构变化导致误报）
                const needsIsNodePatch = beforeOpenApi.includes('const isNode = eval(`typeof process');
                if (needsIsNodePatch && !contents.includes('const isNode = false')) {
                    this.error('[sub-store-transform] open-api.js 环境检测补丁未生效：isNode 仍可能触发 eval()');
                }
                const needsIsSurgePatch = beforeOpenApi.includes('const isSurge = typeof $httpClient');
                if (needsIsSurgePatch && !contents.includes('const isSurge = true;')) {
                    this.error('[sub-store-transform] open-api.js 环境检测补丁未生效：isSurge 未被固定为 true');
                }

                // 注入获取当前请求 ID 的辅助函数
                // 在 OpenAPI 类之前注入
                if (contents.includes('export class OpenAPI')) {
                    contents = contents.replace(
                        'export class OpenAPI',
                        `// 获取当前请求的缓存（请求级隔离）
// __SUB_STORE_WORKERS_PATCH__REQUEST_CACHE_ISOLATION__
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
                } else {
                    this.error('[sub-store-transform] open-api.js 补丁未应用：未找到 export class OpenAPI');
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

                if (contents !== beforeOpenApi) {
                    openApiPatchApplied += 1;
                }

                // open-api.js 自检：关键替换必须存在
                const requiredMarkers = [
                    '__SUB_STORE_WORKERS_PATCH__REQUEST_CACHE_ISOLATION__',
                    'this.cache = __getRequestCache__()',
                    'const data = JSON.stringify(__getRequestCache__(), null, 2)',
                    '__setRequestCache__(key, data);',
                    'return __getRequestCache__()[key];',
                    'const __cache__ = __getRequestCache__(); delete __cache__[key];',
                ];
                const missing = requiredMarkers.filter((m) => !contents.includes(m));
                if (missing.length > 0) {
                    this.error(`[sub-store-transform] open-api.js 补丁自检失败：缺少片段: ${missing.join(', ')}`);
                }
            }

            // ============ download.js 修改：tasks 仅做并发去重（in-flight），避免长期缓存 ============
            // fail-fast：补丁不生效则 dev/build 直接报错退出，避免静默失效。
            if (id.includes('sub-store/backend/src/utils/download.js')) {
                downloadFileSeen = true;
                // 已补丁则跳过，避免重复注入
                if (!contents.includes('__SUB_STORE_WORKERS_PATCH__INFLIGHT_TASKS__')) {
                    const startMarker = 'export default async function download';
                    const endMarker = 'export async function downloadFile';

                    // 先禁用原有 tasks 的长期缓存（tasks 定义在函数外部）
                    if (!contents.includes('const tasks = new Map();')) {
                        this.error('[sub-store-transform] download.js 结构已变化，补丁未应用：缺少 tasks 定义');
                    }
                    contents = contents.replace(
                        'const tasks = new Map();',
                        `// __SUB_STORE_WORKERS_PATCH__INFLIGHT_TASKS__
// tasks 仅用于并发去重（in-flight），不允许长期缓存结果
// 原实现会导致同一 isolate 生命周期内永远返回旧订阅，只有重新部署/重启才会更新
const tasks = {
    has: () => false,
    get: () => undefined,
    set: () => {},
    delete: () => {},
};`
                    );

                    const startIdx = contents.indexOf(startMarker);
                    const endIdx = contents.indexOf(endMarker);
                    if (startIdx === -1 || endIdx === -1 || startIdx >= endIdx) {
                        this.error(`[sub-store-transform] 无法定位 download() 的边界，补丁未应用：${id}`);
                    }

                    const before = contents.slice(0, startIdx);
                    const chunk = contents.slice(startIdx, endIdx);
                    const after = contents.slice(endIdx);

                    // 必须命中这些关键片段，否则认为 upstream 变更，补丁不可靠
                    const requiredNeedles = [
                        'tasks.has(id)',
                        'tasks.set(id, result)',
                        'const id = hex_md5(',
                    ];
                    const missing = requiredNeedles.filter((n) => !chunk.includes(n));
                    if (missing.length > 0) {
                        this.error(
                            `[sub-store-transform] download.js 结构已变化，补丁未应用：缺少关键片段: ${missing.join(', ')}`
                        );
                    }

                    // 1) 将原 download 实现重命名为 __download_impl__（保留参数列表与函数体）
                    let patchedChunk = chunk.replace(
                        startMarker,
                        'async function __download_impl__'
                    );

                    // 2) 注入新的 export default wrapper：in-flight 去重 + 完成后删除
                    const wrapper = `export default async function download(
    rawUrl = '',
    ua,
    timeout,
    customProxy,
    skipCustomCache,
    awaitCustomCache,
    noCache,
    preprocess,
) {
    let $arguments = {};
    try {
        let url = String(rawUrl).replace(/#noFlow$/, '');
        const rawArgs = url.split('#');
        url = url.split('#')[0];
        if (rawArgs.length > 1) {
            try {
                $arguments = JSON.parse(decodeURIComponent(rawArgs[1]));
            } catch (e) {
                for (const pair of rawArgs[1].split('&')) {
                    const key = pair.split('=')[0];
                    const value = pair.split('=')[1];
                    $arguments[key] =
                        value == null || value === ''
                            ? true
                            : decodeURIComponent(value);
                }
            }
        }
    } catch (e) {
        $arguments = {};
    }

    // 指定 noCache 时跳过去重逻辑（强制每次都走完整下载/缓存判断）
    if (noCache || ($arguments && $arguments.noCache)) {
        return await __download_impl__(
            rawUrl,
            ua,
            timeout,
            customProxy,
            skipCustomCache,
            awaitCustomCache,
            noCache,
            preprocess,
        );
    }

    // in-flight 去重 key（避免重复实现内部 id 计算逻辑）
    const inflightKey =
        String(ua || '') +
        '::' +
        String(rawUrl) +
        '::' +
        (preprocess ? '1' : '0');

    if (!globalThis.__sub_store_workers_inflight_tasks__) {
        globalThis.__sub_store_workers_inflight_tasks__ = new Map();
    }

    if (globalThis.__sub_store_workers_inflight_tasks__.has(inflightKey)) {
        return await globalThis.__sub_store_workers_inflight_tasks__.get(inflightKey);
    }

    const p = (async () => {
        try {
            return await __download_impl__(
                rawUrl,
                ua,
                timeout,
                customProxy,
                skipCustomCache,
                awaitCustomCache,
                noCache,
                preprocess,
            );
        } finally {
            globalThis.__sub_store_workers_inflight_tasks__.delete(inflightKey);
        }
    })();

    globalThis.__sub_store_workers_inflight_tasks__.set(inflightKey, p);
    return await p;
}
`;

                    patchedChunk = wrapper + '\n' + patchedChunk;

                    // 自检：wrapper 必须存在
                    if (patchedChunk.includes('export default async function download(') === false) {
                        this.error('[sub-store-transform] download.js 补丁自检失败：wrapper 未注入');
                    }

                    downloadPatchApplied += 1;
                    contents = before + patchedChunk + after;

                    // 自检：整体代码必须包含 marker（tasks 禁用处）
                    if (!contents.includes('__SUB_STORE_WORKERS_PATCH__INFLIGHT_TASKS__')) {
                        this.error('[sub-store-transform] download.js 补丁自检失败：缺少 marker');
                    }
                }
            }

            // ============ processors/index.js 修改：用 QuickJS 替代 new Function（用户脚本执行） ============
            if (id.includes('sub-store/backend/src/core/proxy-utils/processors/index.js')) {
                processorsFileSeen = true;

                // 已补丁则跳过
                if (!contents.includes('__SUB_STORE_WORKERS_PATCH__QUICKJS_CREATE_DYNAMIC_FUNCTION__')) {
                    const startMarker = 'function createDynamicFunction(name, script, $arguments, $options) {';
                    const startIdx = contents.indexOf(startMarker);
                    if (startIdx === -1) {
                        this.error('[sub-store-transform] processors/index.js 补丁未应用：未找到 createDynamicFunction 定义');
                    }

                    // 该函数位于文件末尾（当前 upstream 结构），直接替换到 EOF，避免复杂括号匹配。
                    const before = contents.slice(0, startIdx);

                    const patched = `function createDynamicFunction(name, script, $arguments, $options) {
    // __SUB_STORE_WORKERS_PATCH__QUICKJS_CREATE_DYNAMIC_FUNCTION__
    // Cloudflare Workers 禁止 new Function/eval：将用户脚本执行委托给宿主 QuickJS 引擎。
    const flowUtils = {
        getFlowField,
        getFlowHeaders,
        parseFlowHeaders,
        flowTransfer,
        validCheck,
        getRmainingDays,
        normalizeFlowHeader,
    };

    const factory = globalThis.__substore_workers_createDynamicFunction__;
    if (typeof factory !== 'function') {
        throw new Error('[Sub-Store Cloudflare] QuickJS script engine not installed');
    }

    return factory({
        name,
        script,
        $arguments,
        $options,
        $substore: $,
        lodash,
        ProxyUtils,
        scriptResourceCache,
        flowUtils,
        produceArtifact,
    });
}
`;

                    processorsPatchApplied += 1;
                    contents = before + patched;

                    if (!contents.includes('__SUB_STORE_WORKERS_PATCH__QUICKJS_CREATE_DYNAMIC_FUNCTION__')) {
                        this.error('[sub-store-transform] processors/index.js 补丁自检失败：缺少 marker');
                    }
                }
            }

            // ============ core/app.js 修改：让 $.log 跟随 DEBUG=true 输出 ============
            if (id.includes('sub-store/backend/src/core/app.js')) {
                openApiDebugFileSeen = true;
                if (!contents.includes('__SUB_STORE_WORKERS_PATCH__OPENAPI_DEBUG__')) {
                    const beforeApp = contents;
                    contents = contents.replace(
                        "const $ = new OpenAPI('sub-store');",
                        "const $ = new OpenAPI('sub-store', (process.env.DEBUG === 'true' || process.env.DEBUG === true)); /* __SUB_STORE_WORKERS_PATCH__OPENAPI_DEBUG__ */",
                    );
                    if (contents !== beforeApp) {
                        openApiDebugPatchApplied += 1;
                    } else {
                        this.error('[sub-store-transform] core/app.js debug 补丁未应用：未命中 OpenAPI 初始化行');
                    }
                }
            }


            if (contents !== code) {
                return { code: contents, map: null };
            }
            return null;
        },

        buildEnd() {
            // 仅当本次构建确实包含 download.js 时才做 fail-fast
            if (!downloadFileSeen) return;
            if (downloadPatchApplied !== 1) {
                this.error(
                    `[sub-store-transform] download.js in-flight 补丁未正确应用：期望 1 次，实际 ${downloadPatchApplied} 次`
                );
            }

            // express/open-api 是运行期关键补丁：如果参与构建就必须命中
            if (expressFileSeen && expressPatchApplied !== 1) {
                this.error(
                    `[sub-store-transform] express.js 补丁未正确应用：期望 1 次，实际 ${expressPatchApplied} 次`
                );
            }
            if (openApiFileSeen && openApiPatchApplied !== 1) {
                this.error(
                    `[sub-store-transform] open-api.js 补丁未正确应用：期望 1 次，实际 ${openApiPatchApplied} 次`
                );
            }

            // processors/index.js 是运行期关键补丁：如果参与构建就必须命中
            if (processorsFileSeen && processorsPatchApplied !== 1) {
                this.error(
                    `[sub-store-transform] processors/index.js 补丁未正确应用：期望 1 次，实际 ${processorsPatchApplied} 次`
                );
            }

            if (openApiDebugFileSeen && openApiDebugPatchApplied !== 1) {
                this.error(
                    `[sub-store-transform] core/app.js OpenAPI debug 补丁未正确应用：期望 1 次，实际 ${openApiDebugPatchApplied} 次`
                );
            }
        },
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
        strictPort: true,
        cors: {
            origin: '*',
            methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
            credentials: true,
        },
    },
});
