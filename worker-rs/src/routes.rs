mod responses;
mod runtime;

use crate::native::export::export_subscription_with_processors;
use crate::native::materialize::{handle_stored_export_request, is_stored_export_path};
use crate::native::model::{
    capabilities, ExportRequest, ParseRequest, ProcessRequest, RemoteSubscriptionRequest,
};
use crate::native::parser::parse_subscription;
use crate::native::process::process_subscription;
use crate::native::remote::fetch_remote_subscription;
use crate::native::resources::handle_resource_request;
use crate::native::store::handle_store_request;
use worker::*;

pub async fn handle(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    let path = url.path().to_string();
    if path == "/api/native/store/init" || path.starts_with("/api/native/store/") {
        return handle_store_request(req, &env, &path).await;
    }
    if is_stored_export_path(&path) {
        return handle_stored_export_request(req, &env, &path).await;
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
        "/api/subs"
            | "/api/collections"
            | "/api/files"
            | "/api/artifacts"
            | "/api/settings"
            | "/api/tokens"
    ) || path.starts_with("/api/sub/")
        || path.starts_with("/api/collection/")
        || path.starts_with("/api/file/")
        || path.starts_with("/api/artifact/")
        || path.starts_with("/api/setting/")
        || path.starts_with("/api/token/")
}
