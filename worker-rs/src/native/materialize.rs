use serde::Deserialize;
use serde::Serialize;
use serde_json::{json, Map, Value};
use worker::{Date, Env, Error, Method, Request, Response, Result};

use crate::native::export::export_subscription_with_processors;
use crate::native::model::{
    FilterOptions, FlagOptions, ProcessorOptions, RenameOptions, SortOptions, TagOptions,
};
use crate::native::remote::fetch_remote_subscription;
use crate::native::store::{
    decode_path_segment, ensure_schema, get_record, is_owner, list_records, upsert_record,
    validate_store_key, STORE_DB_BINDING,
};

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredExportRequest {
    target: Option<String>,
    processors: Option<ProcessorOptions>,
    processor: Option<Value>,
    process: Option<Value>,
    artifact: Option<String>,
    name: Option<String>,
}

#[derive(Debug, Clone, Copy)]
enum MaterializeKind {
    Subscription,
    Collection,
    File,
    Artifact,
}

#[derive(Debug, Clone, Copy)]
pub enum ExportSourceKind {
    Subscription,
    Collection,
}

#[derive(Debug, PartialEq, Eq)]
enum MaterializeAction {
    Export,
    Artifact,
    Raw,
}

#[derive(Debug)]
struct MaterializeRoute {
    kind: MaterializeKind,
    action: MaterializeAction,
    name: String,
    target: Option<String>,
}

#[derive(Debug, Serialize)]
struct ArtifactWriteResponse {
    ok: bool,
    artifact: String,
    item: Value,
}

pub async fn handle_stored_export_request(
    mut req: Request,
    env: &Env,
    path: &str,
) -> Result<Response> {
    let Some(route) = materialize_route(path)? else {
        return Response::error("Not Found", 404);
    };
    if !matches!(req.method(), Method::Get | Method::Post) {
        return Response::error("Method Not Allowed", 405);
    }
    if route.action == MaterializeAction::Artifact && req.method() != Method::Post {
        return Response::error("Method Not Allowed", 405);
    }

    let url = req.url()?;
    let query_target = url
        .query_pairs()
        .find_map(|(key, value)| (key == "target").then(|| value.into_owned()));
    let query_format = url
        .query_pairs()
        .find_map(|(key, value)| (key == "format").then(|| value.into_owned()));
    let query_artifact = url.query_pairs().find_map(|(key, value)| {
        matches!(key.as_ref(), "artifact" | "name").then(|| value.into_owned())
    });

    let request_options = if req.method() == Method::Post {
        req.json::<StoredExportRequest>().await?
    } else {
        StoredExportRequest::default()
    };
    let StoredExportRequest {
        target: request_target,
        processors: request_processors,
        processor: request_processor,
        process: request_process,
        artifact: request_artifact,
        name: request_name,
    } = request_options;

    let db = env.d1(STORE_DB_BINDING)?;
    ensure_schema(&db).await?;
    if !is_owner(&req, env).await? && !has_saved_read_token(&req, &db).await? {
        return Response::error("Unauthorized", 401);
    }

    if route.action == MaterializeAction::Raw {
        let item = match route.kind {
            MaterializeKind::File => get_required_item(&db, "files", &route.name).await?,
            MaterializeKind::Artifact => get_required_item(&db, "artifacts", &route.name).await?,
            _ => return Response::error("Not Found", 404),
        };
        return Response::ok(raw_resource_content(&item).await?);
    }

    let target = request_target
        .as_deref()
        .or(query_target.as_deref())
        .or(route.target.as_deref())
        .map(str::to_string);
    let processors = request_processors.or_else(|| {
        request_processor
            .as_ref()
            .and_then(processor_options_from_value)
            .or_else(|| {
                request_process
                    .as_ref()
                    .and_then(processor_options_from_value)
            })
    });

    if route.action == MaterializeAction::Artifact {
        let source_kind = export_source_kind(route.kind)?;
        let (artifact_name, artifact) = materialize_saved_export(
            &db,
            source_kind,
            &route.name,
            target.as_deref(),
            processors.as_ref(),
            request_artifact
                .as_deref()
                .or(request_name.as_deref())
                .or(query_artifact.as_deref()),
        )
        .await?;
        return Response::from_json(&ArtifactWriteResponse {
            ok: true,
            artifact: artifact_name,
            item: artifact,
        });
    }

    let source_kind = export_source_kind(route.kind)?;
    let exported = export_saved_resource(
        &db,
        source_kind,
        &route.name,
        target.as_deref(),
        processors.as_ref(),
    )
    .await?;

    if query_format.as_deref() == Some("raw") {
        Response::ok(exported.content)
    } else {
        Response::from_json(&exported)
    }
}

pub fn is_stored_export_path(path: &str) -> bool {
    materialize_route(path).ok().flatten().is_some()
}

pub async fn export_saved_resource(
    db: &worker::d1::D1Database,
    kind: ExportSourceKind,
    name: &str,
    target: Option<&str>,
    processors: Option<&ProcessorOptions>,
) -> Result<crate::native::model::ExportResponse> {
    let item = get_required_item(db, kind.scope(), name).await?;
    let default_target = string_field(&item, &["target", "type", "platform"]);
    let target = target.or(default_target.as_deref()).unwrap_or("json");
    let processors = processors
        .cloned()
        .or_else(|| processor_options_from_item(&item));
    let content = match kind {
        ExportSourceKind::Subscription => subscription_content(&item).await?,
        ExportSourceKind::Collection => collection_content(db, &item).await?,
    };
    Ok(export_subscription_with_processors(
        &content,
        Some(target),
        processors.as_ref(),
    ))
}

pub async fn materialize_saved_export(
    db: &worker::d1::D1Database,
    kind: ExportSourceKind,
    name: &str,
    target: Option<&str>,
    processors: Option<&ProcessorOptions>,
    artifact_name: Option<&str>,
) -> Result<(String, Value)> {
    let exported = export_saved_resource(db, kind, name, target, processors).await?;
    let artifact_name = artifact_name
        .map(str::to_string)
        .unwrap_or_else(|| format!("{}-{}", name, exported.target));
    validate_store_key("artifact", &artifact_name)?;
    let artifact = json!({
        "name": artifact_name,
        "sourceKind": kind.as_str(),
        "sourceName": name,
        "target": exported.target,
        "content": exported.content,
        "stats": exported.stats,
        "warnings": exported.warnings,
        "generatedAt": Date::now().as_millis().to_string()
    });
    let record = upsert_record(db, "artifacts", &artifact_name, artifact).await?;
    Ok((artifact_name, record.value))
}

fn materialize_route(path: &str) -> Result<Option<MaterializeRoute>> {
    for (prefix, kind) in [
        ("/api/sub/", MaterializeKind::Subscription),
        ("/api/collection/", MaterializeKind::Collection),
        ("/api/file/", MaterializeKind::File),
        ("/api/artifact/", MaterializeKind::Artifact),
    ] {
        let Some(rest) = path.strip_prefix(prefix) else {
            continue;
        };
        let parts = rest
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.len() != 2 {
            return Ok(None);
        }
        let mut target = None;
        let action = match parts[1] {
            "export"
                if matches!(
                    kind,
                    MaterializeKind::Subscription | MaterializeKind::Collection
                ) =>
            {
                MaterializeAction::Export
            }
            "artifact"
                if matches!(
                    kind,
                    MaterializeKind::Subscription | MaterializeKind::Collection
                ) =>
            {
                MaterializeAction::Artifact
            }
            "raw" if matches!(kind, MaterializeKind::File | MaterializeKind::Artifact) => {
                MaterializeAction::Raw
            }
            value
                if matches!(
                    kind,
                    MaterializeKind::Subscription | MaterializeKind::Collection
                ) =>
            {
                target = Some(decode_path_segment(value));
                MaterializeAction::Export
            }
            _ => return Ok(None),
        };
        let name = decode_path_segment(parts[0]);
        validate_store_key("name", &name)?;
        if let Some(target) = &target {
            validate_store_key("target", target)?;
        }
        return Ok(Some(MaterializeRoute {
            kind,
            action,
            name,
            target,
        }));
    }
    Ok(None)
}

fn export_source_kind(kind: MaterializeKind) -> Result<ExportSourceKind> {
    match kind {
        MaterializeKind::Subscription => Ok(ExportSourceKind::Subscription),
        MaterializeKind::Collection => Ok(ExportSourceKind::Collection),
        _ => Err(Error::RustError("resource is not exportable".to_string())),
    }
}

async fn get_required_item(db: &worker::d1::D1Database, scope: &str, name: &str) -> Result<Value> {
    get_record(db, scope, name)
        .await?
        .map(|record| record.value)
        .ok_or_else(|| Error::RustError(format!("{} `{}` was not found", scope, name)))
}

async fn subscription_content(item: &Value) -> Result<String> {
    raw_resource_content(item).await.map_err(|_| {
        Error::RustError("subscription must include content, source, or url".to_string())
    })
}

async fn raw_resource_content(item: &Value) -> Result<String> {
    if let Some(content) = string_field(item, &["content", "body", "raw"]) {
        return Ok(content);
    }
    if let Some(source) = string_field(item, &["source"]) {
        if is_http_url(&source) {
            return fetch_remote_subscription(&source).await;
        }
        return Ok(source);
    }
    if let Some(url) = string_field(item, &["url", "uri", "link"]) {
        return fetch_remote_subscription(&url).await;
    }
    Err(Error::RustError(
        "resource must include content, source, or url".to_string(),
    ))
}

async fn collection_content(db: &worker::d1::D1Database, item: &Value) -> Result<String> {
    let mut contents = Vec::new();
    for entry in collection_entries(item) {
        match entry {
            Value::String(value) => {
                if is_http_url(&value) {
                    contents.push(fetch_remote_subscription(&value).await?);
                } else if let Some(record) = get_record(db, "subscriptions", &value).await? {
                    contents.push(subscription_content(&record.value).await?);
                } else {
                    contents.push(value);
                }
            }
            Value::Object(_) => {
                if let Some(name) = string_field(&entry, &["name", "subscription"]) {
                    if let Some(record) = get_record(db, "subscriptions", &name).await? {
                        contents.push(subscription_content(&record.value).await?);
                        continue;
                    }
                }
                contents.push(subscription_content(&entry).await?);
            }
            _ => {}
        }
    }
    if contents.is_empty() {
        return Err(Error::RustError(
            "collection must include subscriptions, subs, items, urls, or content".to_string(),
        ));
    }
    Ok(contents.join("\n"))
}

fn collection_entries(item: &Value) -> Vec<Value> {
    for key in ["subscriptions", "subs", "items", "urls", "sources"] {
        if let Some(values) = item.get(key).and_then(Value::as_array) {
            return values.clone();
        }
    }
    if let Some(content) = string_field(item, &["content", "body", "raw"]) {
        return vec![Value::String(content)];
    }
    Vec::new()
}

fn processor_options_from_item(item: &Value) -> Option<ProcessorOptions> {
    for key in ["processors", "processor", "process"] {
        if let Some(value) = item.get(key) {
            return processor_options_from_value(value);
        }
    }
    None
}

fn processor_options_from_value(value: &Value) -> Option<ProcessorOptions> {
    match value {
        Value::Object(_) => serde_json::from_value::<ProcessorOptions>(value.clone()).ok(),
        Value::Array(steps) => {
            let mut options = ProcessorOptions::default();
            for step in steps {
                let Value::Object(step) = step else {
                    continue;
                };
                let step_type = step
                    .get("type")
                    .or_else(|| step.get("name"))
                    .or_else(|| step.get("operator"))
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let payload = Value::Object(without_type_keys(step));
                match step_type {
                    "dedupe" | "distinct" => {
                        options.dedupe = Some(true);
                        options.dedupe_by = step
                            .get("by")
                            .or_else(|| step.get("dedupeBy"))
                            .and_then(Value::as_str)
                            .map(str::to_string);
                    }
                    "filter" | "include" | "exclude" => {
                        options.filter = serde_json::from_value::<FilterOptions>(payload).ok()
                    }
                    "rename" | "rename-node" => {
                        options.rename = serde_json::from_value::<RenameOptions>(payload).ok()
                    }
                    "flag" | "country-flag" => {
                        options.flag = serde_json::from_value::<FlagOptions>(payload).ok()
                    }
                    "tag" | "add-tag" => {
                        options.tag = serde_json::from_value::<TagOptions>(payload).ok()
                    }
                    "sort" => options.sort = serde_json::from_value::<SortOptions>(payload).ok(),
                    "limit" | "slice" => {
                        options.limit = step
                            .get("limit")
                            .or_else(|| step.get("count"))
                            .or_else(|| step.get("size"))
                            .and_then(Value::as_u64)
                            .map(|value| value as usize)
                    }
                    "reverse" => options.reverse = Some(true),
                    _ => {}
                }
            }
            Some(options)
        }
        _ => None,
    }
}

fn without_type_keys(step: &Map<String, Value>) -> Map<String, Value> {
    step.iter()
        .filter(|(key, _)| !matches!(key.as_str(), "type" | "name" | "operator"))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

fn string_field(item: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}

async fn has_saved_read_token(req: &Request, db: &worker::d1::D1Database) -> Result<bool> {
    let Some(token) = request_token(req) else {
        return Ok(false);
    };
    if let Some(record) = get_record(db, "tokens", &token).await? {
        return Ok(token_record_enabled(&record.value));
    }
    for record in list_records(db, "tokens").await? {
        if token_record_enabled(&record.value) && token_record_matches(&record.value, &token) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn request_token(req: &Request) -> Option<String> {
    req.headers()
        .get("authorization")
        .ok()
        .flatten()
        .and_then(|value| value.strip_prefix("Bearer ").map(str::to_string))
        .or_else(|| req.headers().get("x-sub-store-token").ok().flatten())
        .or_else(|| {
            req.url().ok().and_then(|url| {
                url.query_pairs().find_map(|(key, value)| {
                    matches!(key.as_ref(), "token" | "key" | "sub-store-token")
                        .then(|| value.into_owned())
                })
            })
        })
}

fn token_record_enabled(record: &Value) -> bool {
    record
        .get("enabled")
        .or_else(|| record.get("active"))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn token_record_matches(record: &Value, token: &str) -> bool {
    ["token", "secret", "value", "key"]
        .iter()
        .any(|key| record.get(*key).and_then(Value::as_str) == Some(token))
}

impl ExportSourceKind {
    pub fn scope(&self) -> &'static str {
        match self {
            ExportSourceKind::Subscription => "subscriptions",
            ExportSourceKind::Collection => "collections",
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            ExportSourceKind::Subscription => "subscription",
            ExportSourceKind::Collection => "collection",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routes_short_target_exports() {
        let route = materialize_route("/api/sub/main/sing-box")
            .unwrap()
            .expect("route");
        assert!(matches!(route.kind, MaterializeKind::Subscription));
        assert_eq!(route.action, MaterializeAction::Export);
        assert_eq!(route.name, "main");
        assert_eq!(route.target.as_deref(), Some("sing-box"));
    }

    #[test]
    fn routes_raw_artifacts() {
        let route = materialize_route("/api/artifact/main-sing-box/raw")
            .unwrap()
            .expect("route");
        assert!(matches!(route.kind, MaterializeKind::Artifact));
        assert_eq!(route.action, MaterializeAction::Raw);
        assert_eq!(route.name, "main-sing-box");
    }

    #[test]
    fn parses_upstream_style_processor_array() {
        let value = json!([
            { "type": "dedupe" },
            { "type": "filter", "include": "SG|HK" },
            { "type": "rename", "prefix": "[CF] " },
            { "type": "sort", "by": "name" },
            { "type": "limit", "limit": 20 }
        ]);
        let options = processor_options_from_value(&value).expect("processor options");
        assert_eq!(options.dedupe, Some(true));
        assert_eq!(
            options
                .filter
                .as_ref()
                .and_then(|filter| filter.include.as_deref()),
            Some("SG|HK")
        );
        assert_eq!(
            options
                .rename
                .as_ref()
                .and_then(|rename| rename.prefix.as_deref()),
            Some("[CF] ")
        );
        assert_eq!(
            options.sort.as_ref().and_then(|sort| sort.by.as_deref()),
            Some("name")
        );
        assert_eq!(options.limit, Some(20));
    }
}
