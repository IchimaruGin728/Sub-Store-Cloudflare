mod responses;
mod runtime;

use crate::native::export::export_subscription_with_processors;
use crate::native::model::{
    capabilities, ExportRequest, ParseRequest, ProcessRequest, RemoteSubscriptionRequest,
};
use crate::native::parser::parse_subscription;
use crate::native::process::process_subscription;
use crate::native::resources::handle_resource_request;
use crate::native::store::handle_store_request;
use worker::*;

const MAX_REMOTE_SUBSCRIPTION_BYTES: usize = 4 * 1024 * 1024;

pub async fn handle(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    let path = url.path().to_string();
    if path == "/api/native/store/init" || path.starts_with("/api/native/store/") {
        return handle_store_request(req, &env, &path).await;
    }
    if is_resource_path(&path) {
        return handle_resource_request(req, &env, &path).await;
    }

    match (req.method(), url.path()) {
        (Method::Get, "/api/utils/env") => Response::from_json(&responses::env_response(&env)),
        (Method::Get, "/api/utils/worker-status") => {
            Response::from_json(&responses::worker_status(&env))
        }
        (Method::Get, "/api/native/capabilities") => Response::from_json(&capabilities()),
        (Method::Post, "/api/native/parse") => {
            let body: ParseRequest = req.json().await?;
            Response::from_json(&parse_subscription(&body.content))
        }
        (Method::Post, "/api/native/export") => {
            let body: ExportRequest = req.json().await?;
            Response::from_json(&export_subscription_with_processors(
                &body.content,
                body.target.as_deref(),
                body.processors.as_ref(),
            ))
        }
        (Method::Post, "/api/native/process") => {
            let body: ProcessRequest = req.json().await?;
            Response::from_json(&process_subscription(&body.content, &body.processors))
        }
        (Method::Post, "/api/native/fetch/parse") => {
            let body: RemoteSubscriptionRequest = req.json().await?;
            let content = fetch_remote_subscription(&body.url).await?;
            Response::from_json(&parse_subscription(&content))
        }
        (Method::Post, "/api/native/fetch/export") => {
            let body: RemoteSubscriptionRequest = req.json().await?;
            let content = fetch_remote_subscription(&body.url).await?;
            Response::from_json(&export_subscription_with_processors(
                &content,
                body.target.as_deref(),
                body.processors.as_ref(),
            ))
        }
        (Method::Get, "/health") => Response::ok("ok"),
        _ => Response::error("Not Found", 404),
    }
}

fn is_resource_path(path: &str) -> bool {
    matches!(
        path,
        "/api/subs" | "/api/collections" | "/api/files" | "/api/artifacts"
    ) || path.starts_with("/api/sub/")
        || path.starts_with("/api/collection/")
        || path.starts_with("/api/file/")
        || path.starts_with("/api/artifact/")
}

async fn fetch_remote_subscription(url: &str) -> Result<String> {
    let parsed = ::url::Url::parse(url).map_err(|_| Error::RustError("invalid url".to_string()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(Error::RustError(
            "remote subscription url must use http or https".to_string(),
        ));
    }

    let mut response = Fetch::Url(parsed).send().await?;
    let status = response.status_code();
    if !(200..=299).contains(&status) {
        return Err(Error::RustError(format!(
            "remote subscription fetch failed with status {}",
            status
        )));
    }
    if let Some(length) = response.headers().get("content-length")? {
        if length.parse::<usize>().unwrap_or(0) > MAX_REMOTE_SUBSCRIPTION_BYTES {
            return Err(Error::RustError(format!(
                "remote subscription exceeds {} bytes",
                MAX_REMOTE_SUBSCRIPTION_BYTES
            )));
        }
    }

    let content = response.text().await?;
    if content.len() > MAX_REMOTE_SUBSCRIPTION_BYTES {
        return Err(Error::RustError(format!(
            "remote subscription exceeds {} bytes",
            MAX_REMOTE_SUBSCRIPTION_BYTES
        )));
    }
    Ok(content)
}
