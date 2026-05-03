use serde::{Deserialize, Serialize};
use serde_json::Value;
use worker::{Date, Env, Error, Method, Request, Response, Result};

use crate::native::materialize::{materialize_saved_export, ExportSourceKind};
use crate::native::model::ProcessorOptions;
use crate::native::store::{
    decode_path_segment, ensure_schema, get_record, is_owner, list_records, validate_store_key,
    STORE_DB_BINDING,
};

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RefreshRequest {
    names: Option<Vec<String>>,
    target: Option<String>,
    targets: Option<Vec<String>>,
    processors: Option<ProcessorOptions>,
    subscriptions: Option<bool>,
    collections: Option<bool>,
    include_disabled: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub ok: bool,
    pub refreshed: usize,
    pub failed: usize,
    results: Vec<RefreshResult>,
    refreshed_at: String,
}

#[derive(Debug, Serialize)]
struct RefreshResult {
    ok: bool,
    kind: &'static str,
    name: String,
    target: Option<String>,
    artifact: Option<String>,
    error: Option<String>,
}

pub async fn handle_refresh_request(mut req: Request, env: &Env, path: &str) -> Result<Response> {
    if req.method() != Method::Post {
        return Response::error("Method Not Allowed", 405);
    }
    if !is_owner(&req, env).await? {
        return Response::error("Unauthorized", 401);
    }

    let db = env.d1(STORE_DB_BINDING)?;
    ensure_schema(&db).await?;
    let mut request = refresh_request_from_body(&mut req).await?;
    let kinds = if let Some((kind, name)) = single_refresh_route(path)? {
        request.names = Some(vec![name]);
        vec![kind]
    } else {
        refresh_kinds(path, &request)?
    };
    let response = refresh_resources(&db, &request, &kinds).await?;
    Response::from_json(&response)
}

pub async fn run_scheduled_refresh(env: Env) -> Result<RefreshResponse> {
    let db = env.d1(STORE_DB_BINDING)?;
    ensure_schema(&db).await?;
    refresh_resources(
        &db,
        &RefreshRequest {
            subscriptions: Some(true),
            collections: Some(true),
            ..RefreshRequest::default()
        },
        &[ExportSourceKind::Subscription, ExportSourceKind::Collection],
    )
    .await
}

pub fn is_refresh_path(path: &str) -> bool {
    path == "/api/refresh"
        || path == "/api/refresh/subscriptions"
        || path == "/api/refresh/collections"
        || single_refresh_route(path).ok().flatten().is_some()
}

async fn refresh_request_from_body(req: &mut Request) -> Result<RefreshRequest> {
    let body = req.text().await?;
    if body.trim().is_empty() {
        Ok(RefreshRequest::default())
    } else {
        serde_json::from_str(&body).map_err(|err| Error::RustError(err.to_string()))
    }
}

fn refresh_kinds(path: &str, request: &RefreshRequest) -> Result<Vec<ExportSourceKind>> {
    if path == "/api/refresh/subscriptions" {
        return Ok(vec![ExportSourceKind::Subscription]);
    }
    if path == "/api/refresh/collections" {
        return Ok(vec![ExportSourceKind::Collection]);
    }
    if path == "/api/refresh" {
        let subscriptions = request.subscriptions.unwrap_or(true);
        let collections = request.collections.unwrap_or(true);
        let mut kinds = Vec::new();
        if subscriptions {
            kinds.push(ExportSourceKind::Subscription);
        }
        if collections {
            kinds.push(ExportSourceKind::Collection);
        }
        return Ok(kinds);
    }
    Err(Error::RustError("not a refresh path".to_string()))
}

fn single_refresh_route(path: &str) -> Result<Option<(ExportSourceKind, String)>> {
    for (prefix, kind) in [
        ("/api/sub/", ExportSourceKind::Subscription),
        ("/api/collection/", ExportSourceKind::Collection),
    ] {
        let Some(rest) = path.strip_prefix(prefix) else {
            continue;
        };
        let parts = rest
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.len() != 2 || parts[1] != "refresh" {
            return Ok(None);
        }
        let name = decode_path_segment(parts[0]);
        validate_store_key("name", &name)?;
        return Ok(Some((kind, name)));
    }
    Ok(None)
}

async fn refresh_resources(
    db: &worker::d1::D1Database,
    request: &RefreshRequest,
    kinds: &[ExportSourceKind],
) -> Result<RefreshResponse> {
    let mut results = Vec::new();
    for kind in kinds {
        let records = records_for_kind(db, *kind, request.names.as_deref()).await?;
        for record in records {
            if !request.include_disabled.unwrap_or(false) && !record_enabled(&record.value) {
                continue;
            }
            let targets = targets_for_record(&record.value, request);
            for target in targets {
                let artifact_name = artifact_name_for_record(&record.value, &record.name, &target);
                match materialize_saved_export(
                    db,
                    *kind,
                    &record.name,
                    Some(&target),
                    request.processors.as_ref(),
                    artifact_name.as_deref(),
                )
                .await
                {
                    Ok((artifact, _)) => results.push(RefreshResult {
                        ok: true,
                        kind: kind.as_str(),
                        name: record.name.clone(),
                        target: Some(target),
                        artifact: Some(artifact),
                        error: None,
                    }),
                    Err(err) => results.push(RefreshResult {
                        ok: false,
                        kind: kind.as_str(),
                        name: record.name.clone(),
                        target: Some(target),
                        artifact: artifact_name,
                        error: Some(err.to_string()),
                    }),
                }
            }
        }
    }

    let refreshed = results.iter().filter(|result| result.ok).count();
    let failed = results.len().saturating_sub(refreshed);
    Ok(RefreshResponse {
        ok: failed == 0,
        refreshed,
        failed,
        results,
        refreshed_at: Date::now().as_millis().to_string(),
    })
}

async fn records_for_kind(
    db: &worker::d1::D1Database,
    kind: ExportSourceKind,
    names: Option<&[String]>,
) -> Result<Vec<crate::native::store::StoreRecord>> {
    let Some(names) = names else {
        return list_records(db, kind.scope()).await;
    };
    let mut records = Vec::new();
    for name in names {
        let name = decode_path_segment(name);
        validate_store_key("name", &name)?;
        if let Some(record) = get_record(db, kind.scope(), &name).await? {
            records.push(record);
        }
    }
    Ok(records)
}

fn targets_for_record(record: &Value, request: &RefreshRequest) -> Vec<String> {
    if let Some(targets) = &request.targets {
        return clean_targets(targets.clone());
    }
    if let Some(target) = &request.target {
        return clean_targets(vec![target.clone()]);
    }
    if let Some(targets) = record.get("targets").and_then(Value::as_array) {
        return clean_targets(
            targets
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect(),
        );
    }
    for key in ["target", "type", "platform"] {
        if let Some(target) = record.get(key).and_then(Value::as_str) {
            return clean_targets(vec![target.to_string()]);
        }
    }
    vec!["json".to_string()]
}

fn clean_targets(targets: Vec<String>) -> Vec<String> {
    let mut clean = Vec::new();
    for target in targets {
        if !target.is_empty() && !clean.contains(&target) {
            clean.push(target);
        }
    }
    if clean.is_empty() {
        clean.push("json".to_string());
    }
    clean
}

fn artifact_name_for_record(record: &Value, name: &str, target: &str) -> Option<String> {
    if let Some(artifact) = record.get("artifact").and_then(Value::as_str) {
        return Some(artifact.to_string());
    }
    if let Some(artifacts) = record.get("artifacts").and_then(Value::as_object) {
        if let Some(artifact) = artifacts.get(target).and_then(Value::as_str) {
            return Some(artifact.to_string());
        }
    }
    Some(format!("{}-{}", name, target))
}

fn record_enabled(record: &Value) -> bool {
    record
        .get("enabled")
        .or_else(|| record.get("active"))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_single_refresh_routes() {
        let (kind, name) = single_refresh_route("/api/sub/main/refresh")
            .unwrap()
            .expect("route");
        assert!(matches!(kind, ExportSourceKind::Subscription));
        assert_eq!(name, "main");

        let (kind, name) = single_refresh_route("/api/collection/daily/refresh")
            .unwrap()
            .expect("route");
        assert!(matches!(kind, ExportSourceKind::Collection));
        assert_eq!(name, "daily");
    }

    #[test]
    fn derives_refresh_targets_from_record() {
        let record = json!({ "targets": ["sing-box", "clash", "sing-box"] });
        assert_eq!(
            targets_for_record(&record, &RefreshRequest::default()),
            vec!["sing-box".to_string(), "clash".to_string()]
        );

        let request = RefreshRequest {
            target: Some("mihomo".to_string()),
            ..RefreshRequest::default()
        };
        assert_eq!(
            targets_for_record(&record, &request),
            vec!["mihomo".to_string()]
        );
    }
}
