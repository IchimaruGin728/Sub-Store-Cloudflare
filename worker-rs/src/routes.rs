mod responses;
mod runtime;

use worker::*;

pub async fn handle(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let url = req.url()?;
    match (req.method(), url.path()) {
        (Method::Get, "/api/utils/env") => Response::from_json(&responses::env_response(&env)),
        (Method::Get, "/api/utils/worker-status") => {
            Response::from_json(&responses::worker_status(&env))
        }
        (Method::Get, "/health") => Response::ok("ok"),
        _ => Response::error("Not Found", 404),
    }
}
