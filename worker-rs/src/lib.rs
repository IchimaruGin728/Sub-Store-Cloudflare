mod native;
mod routes;

use worker::*;

#[event(fetch)]
async fn main(req: Request, env: Env, ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();
    routes::handle(req, env, ctx).await
}

#[event(scheduled)]
async fn scheduled(_event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    console_error_panic_hook::set_once();
    match native::refresh::run_scheduled_refresh(env).await {
        Ok(response) => console_log!(
            "scheduled refresh completed: refreshed={}, failed={}",
            response.refreshed,
            response.failed
        ),
        Err(err) => console_error!("scheduled refresh failed: {}", err),
    }
}
