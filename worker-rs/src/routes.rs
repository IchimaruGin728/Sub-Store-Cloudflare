mod responses;
mod runtime;

use crate::native::export::export_subscription;
use crate::native::model::{capabilities, ExportRequest, ParseRequest};
use crate::native::parser::parse_subscription;
use worker::*;

pub async fn handle(mut req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
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
            Response::from_json(&export_subscription(&body.content, body.target.as_deref()))
        }
        (Method::Get, "/health") => Response::ok("ok"),
        _ => Response::error("Not Found", 404),
    }
}
