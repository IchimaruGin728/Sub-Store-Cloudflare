use serde::Serialize;
use worker::*;

const BACKEND_NAME: &str = "Cloudflare Workers";
const ADAPTER_NAME: &str = "Sub-Store Cloudflare";
const ICON_URL: &str = "https://cdn.jsdelivr.net/gh/IchimaruGin728/Sub-Store-Cloudflare@main/assets/cloudflare.svg";

#[derive(Serialize)]
struct EnvResponse<'a> {
    backend: &'a str,
    version: String,
    feature: FeatureFlags,
    meta: Meta<'a>,
    icon: &'a str,
    #[serde(rename = "isCloudflare")]
    is_cloudflare: bool,
    #[serde(rename = "isWorker")]
    is_worker: bool,
    #[serde(rename = "isWorkers")]
    is_workers: bool,
    #[serde(rename = "isSurge")]
    is_surge: bool,
    #[serde(rename = "isNode")]
    is_node: bool,
}

#[derive(Serialize)]
struct FeatureFlags {
    cloudflare: bool,
    worker: bool,
    workers: bool,
    pages: bool,
    surge: bool,
}

#[derive(Serialize)]
struct Meta<'a> {
    worker: WorkerMeta<'a>,
    cloudflare: CloudflareMeta,
}

#[derive(Serialize)]
struct WorkerMeta<'a> {
    runtime: &'a str,
    adapter: &'a str,
    icon: &'a str,
}

#[derive(Serialize)]
struct CloudflareMeta {
    compute: Vec<&'static str>,
    storage: Vec<&'static str>,
    ai: Vec<&'static str>,
    media: Vec<&'static str>,
    observability: Vec<&'static str>,
}

#[derive(Serialize)]
struct WorkerStatus<'a> {
    ok: bool,
    backend: &'a str,
    adapter: &'a str,
    runtime: &'a str,
    version: String,
}

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();

    let url = req.url()?;
    match (req.method(), url.path()) {
        (Method::Get, "/api/utils/env") => Response::from_json(&build_env_response(&env)),
        (Method::Get, "/api/utils/worker-status") => Response::from_json(&WorkerStatus {
            ok: true,
            backend: BACKEND_NAME,
            adapter: ADAPTER_NAME,
            runtime: "workerd/worker-rs",
            version: upstream_backend_version(&env),
        }),
        (Method::Get, "/health") => Response::ok("ok"),
        _ => Response::error("Not Found", 404),
    }
}

fn build_env_response(env: &Env) -> EnvResponse<'static> {
    EnvResponse {
        backend: BACKEND_NAME,
        version: upstream_backend_version(env),
        feature: FeatureFlags {
            cloudflare: true,
            worker: true,
            workers: true,
            pages: true,
            surge: false,
        },
        meta: Meta {
            worker: WorkerMeta {
                runtime: "Cloudflare Workers / worker-rs",
                adapter: ADAPTER_NAME,
                icon: ICON_URL,
            },
            cloudflare: CloudflareMeta {
                compute: vec![
                    "Workers",
                    "Pages",
                    "Durable Objects",
                    "Queues",
                    "Workflows",
                    "Browser Rendering",
                ],
                storage: vec!["D1", "Durable Object Storage", "R2", "KV"],
                ai: vec!["Workers AI", "AI Gateway", "Vectorize"],
                media: vec!["Images", "Stream"],
                observability: vec!["Workers Logs", "Analytics Engine"],
            },
        },
        icon: ICON_URL,
        is_cloudflare: true,
        is_worker: true,
        is_workers: true,
        is_surge: false,
        is_node: false,
    }
}

fn upstream_backend_version(env: &Env) -> String {
    env.var("SUB_STORE_BACKEND_VERSION")
        .map(|value| value.to_string())
        .unwrap_or_else(|_| "upstream-latest".to_string())
}
