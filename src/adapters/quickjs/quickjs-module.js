/**
 * QuickJS module loader (Cloudflare Workers friendly)
 *
 * We import the wasm as a module (WebAssembly.Module) via a relative path.
 * The wasm file is copied into src/ by scripts/copy-quickjs-wasm.sh.
 */

import { newQuickJSWASMModule, newVariant, RELEASE_SYNC as baseVariant } from 'quickjs-emscripten';
import wasmModule from './wasm/RELEASE_SYNC.wasm';

let quickJsModulePromise = null;

export async function getQuickJsModule() {
    if (!quickJsModulePromise) {
        const variant = newVariant(baseVariant, {
            wasmModule,
            // Note: wasmSourceMapData is optional; we intentionally avoid importing map files.
        });
        quickJsModulePromise = newQuickJSWASMModule(variant);
    }
    return await quickJsModulePromise;
}
