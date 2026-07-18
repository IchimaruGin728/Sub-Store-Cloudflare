use worker::Env;

pub const BACKEND_NAME: &str = "Cloudflare Workers";
pub const ADAPTER_NAME: &str = "Sub-Store Cloudflare";
pub const ICON_URL: &str =
    "https://cdn.jsdelivr.net/gh/IchimaruGin728/Sub-Store-Cloudflare@main/assets/cloudflare.svg";

pub fn upstream_backend_version(env: &Env) -> String {
    env.var("SUB_STORE_BACKEND_VERSION")
        .map(|value| value.to_string())
        .unwrap_or_else(|_| "upstream-latest".to_string())
}
