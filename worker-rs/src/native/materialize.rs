use serde::Deserialize;
use serde_json::Value;
use worker::{Env, Error, Method, Request, Response, Result};

use crate::native::export::export_subscription_with_processors;
use crate::native::model::ProcessorOptions;
use crate::native::remote::fetch_remote_subscription;
use crate::native::store::{
    decode_path_segment, ensure_schema, get_record, is_owner, validate_store_key, STORE_DB_BINDING,
};

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredExportRequest {
    target: Option<String>,
    processors: Option<ProcessorOptions>,
}

#[derive(Debug)]
enum StoredExportKind {
    Subscription,
    Collection,
}

#[derive(Debug)]
struct StoredExportRoute {
    kind: StoredExportKind,
    name: String,
}

pub async fn handle_stored_export_request(
    mut req: Request,
    env: &Env,
    path: &str,
) -> Result<Response> {
    if !is_owner(&req, env).await? {
        return Response::error("Unauthorized", 401);
    }

    let Some(route) = stored_export_route(path)? else {
        return Response::error("Not Found", 404);
    };
    if !matches!(req.method(), Method::Get | Method::Post) {
        return Response::error("Method Not Allowed", 405);
    }

    let url = req.url()?;
    let query_target = url
        .query_pairs()
        .find_map(|(key, value)| (key == "target").then(|| value.into_owned()));
    let query_format = url
        .query_pairs()
        .find_map(|(key, value)| (key == "format").then(|| value.into_owned()));

    let request_options = if req.method() == Method::Post {
        req.json::<StoredExportRequest>().await?
    } else {
        StoredExportRequest::default()
    };

    let db = env.d1(STORE_DB_BINDING)?;
    ensure_schema(&db).await?;

    let item = match route.kind {
        StoredExportKind::Subscription => {
            get_required_item(&db, "subscriptions", &route.name).await?
        }
        StoredExportKind::Collection => get_required_item(&db, "collections", &route.name).await?,
    };

    let default_target = string_field(&item, &["target", "type", "platform"]);
    let target = request_options
        .target
        .as_deref()
        .or(query_target.as_deref())
        .or(default_target.as_deref())
        .unwrap_or("json");
    let processors = request_options
        .processors
        .or_else(|| processor_options_from_item(&item));

    let content = match route.kind {
        StoredExportKind::Subscription => subscription_content(&item).await?,
        StoredExportKind::Collection => collection_content(&db, &item).await?,
    };
    let exported = export_subscription_with_processors(&content, Some(target), processors.as_ref());

    if query_format.as_deref() == Some("raw") {
        Response::ok(exported.content)
    } else {
        Response::from_json(&exported)
    }
}

pub fn is_stored_export_path(path: &str) -> bool {
    stored_export_route(path).ok().flatten().is_some()
}

fn stored_export_route(path: &str) -> Result<Option<StoredExportRoute>> {
    for (prefix, kind) in [
        ("/api/sub/", StoredExportKind::Subscription),
        ("/api/collection/", StoredExportKind::Collection),
    ] {
        let Some(rest) = path.strip_prefix(prefix) else {
            continue;
        };
        let parts = rest
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.len() != 2 || parts[1] != "export" {
            return Ok(None);
        }
        let name = decode_path_segment(parts[0]);
        validate_store_key("name", &name)?;
        return Ok(Some(StoredExportRoute { kind, name }));
    }
    Ok(None)
}

async fn get_required_item(db: &worker::d1::D1Database, scope: &str, name: &str) -> Result<Value> {
    get_record(db, scope, name)
        .await?
        .map(|record| record.value)
        .ok_or_else(|| Error::RustError(format!("{} `{}` was not found", scope, name)))
}

async fn subscription_content(item: &Value) -> Result<String> {
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
        "subscription must include content, source, or url".to_string(),
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
            if let Ok(options) = serde_json::from_value::<ProcessorOptions>(value.clone()) {
                return Some(options);
            }
        }
    }
    None
}

fn string_field(item: &Value, keys: &[&str]) -> Option<String> {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(Value::as_str))
        .map(str::to_string)
}

fn is_http_url(value: &str) -> bool {
    value.starts_with("https://") || value.starts_with("http://")
}
