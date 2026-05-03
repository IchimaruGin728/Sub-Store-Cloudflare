use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use worker::{Env, Error, Method, Request, Response, Result};

use crate::native::store::{
    decode_path_segment, delete_record, delete_scope, ensure_schema, get_record, is_owner,
    list_records, upsert_record, validate_store_key, StoreRecord, STORE_DB_BINDING,
};

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum ReplaceRequest {
    Items(Vec<Value>),
    Wrapped { items: Vec<Value> },
    Records { records: Vec<Value> },
}

#[derive(Debug, Serialize)]
struct ResourceListResponse {
    ok: bool,
    kind: &'static str,
    items: Vec<Value>,
}

#[derive(Debug, Serialize)]
struct ResourceItemResponse {
    ok: bool,
    kind: &'static str,
    item: Value,
}

#[derive(Debug, Serialize)]
struct ResourceDeleteResponse {
    ok: bool,
    kind: &'static str,
    name: String,
    deleted: bool,
}

#[derive(Debug, Serialize)]
struct ResourceReplaceResponse {
    ok: bool,
    kind: &'static str,
    replaced: usize,
    deleted: usize,
    items: Vec<Value>,
}

pub async fn handle_resource_request(mut req: Request, env: &Env, path: &str) -> Result<Response> {
    if !is_owner(&req, env).await? {
        return Response::error("Unauthorized", 401);
    }

    let Some(route) = resource_route(path)? else {
        return Response::error("Not Found", 404);
    };

    let db = env.d1(STORE_DB_BINDING)?;
    ensure_schema(&db).await?;

    match (req.method(), route.name.as_deref()) {
        (Method::Get, None) => {
            let records = list_records(&db, route.scope).await?;
            Response::from_json(&ResourceListResponse {
                ok: true,
                kind: route.kind,
                items: records.into_iter().map(record_to_item).collect(),
            })
        }
        (Method::Post, None) => {
            let item: Value = req.json().await?;
            let name = name_from_item(&item)?;
            validate_store_key("name", &name)?;
            let item = item_with_name(item, &name);
            let record = upsert_record(&db, route.scope, &name, item).await?;
            Response::from_json(&ResourceItemResponse {
                ok: true,
                kind: route.kind,
                item: record_to_item(record),
            })
        }
        (Method::Put, None) => {
            let replace: ReplaceRequest = req.json().await?;
            let items = match replace {
                ReplaceRequest::Items(items)
                | ReplaceRequest::Wrapped { items }
                | ReplaceRequest::Records { records: items } => items,
            };
            let mut normalized = Vec::with_capacity(items.len());
            for item in items {
                let name = name_from_item(&item)?;
                validate_store_key("name", &name)?;
                normalized.push((name.clone(), item_with_name(item, &name)));
            }

            let deleted = delete_scope(&db, route.scope).await?;
            let mut written = Vec::with_capacity(normalized.len());
            for (name, item) in normalized {
                written.push(record_to_item(
                    upsert_record(&db, route.scope, &name, item).await?,
                ));
            }

            Response::from_json(&ResourceReplaceResponse {
                ok: true,
                kind: route.kind,
                replaced: written.len(),
                deleted,
                items: written,
            })
        }
        (Method::Get, Some(name)) => match get_record(&db, route.scope, name).await? {
            Some(record) => Response::from_json(&ResourceItemResponse {
                ok: true,
                kind: route.kind,
                item: record_to_item(record),
            }),
            None => Response::error("Not Found", 404),
        },
        (Method::Patch, Some(name)) => {
            let patch: Value = req.json().await?;
            let current = get_record(&db, route.scope, name)
                .await?
                .map(|record| record.value)
                .unwrap_or_else(|| Value::Object(Map::new()));
            let merged = item_with_name(merge_item(current, patch), name);
            let record = upsert_record(&db, route.scope, name, merged).await?;
            Response::from_json(&ResourceItemResponse {
                ok: true,
                kind: route.kind,
                item: record_to_item(record),
            })
        }
        (Method::Delete, Some(name)) => {
            let deleted = delete_record(&db, route.scope, name).await?;
            Response::from_json(&ResourceDeleteResponse {
                ok: true,
                kind: route.kind,
                name: name.to_string(),
                deleted,
            })
        }
        _ => Response::error("Method Not Allowed", 405),
    }
}

#[derive(Debug)]
struct ResourceRoute {
    kind: &'static str,
    scope: &'static str,
    name: Option<String>,
}

fn resource_route(path: &str) -> Result<Option<ResourceRoute>> {
    let routes = [
        ("subscription", "subscriptions", "/api/subs", "/api/sub/"),
        (
            "collection",
            "collections",
            "/api/collections",
            "/api/collection/",
        ),
        ("file", "files", "/api/files", "/api/file/"),
        ("artifact", "artifacts", "/api/artifacts", "/api/artifact/"),
        ("setting", "settings", "/api/settings", "/api/setting/"),
        ("token", "tokens", "/api/tokens", "/api/token/"),
    ];

    for (kind, scope, list_path, item_prefix) in routes {
        if path == list_path {
            return Ok(Some(ResourceRoute {
                kind,
                scope,
                name: None,
            }));
        }
        if let Some(rest) = path.strip_prefix(item_prefix) {
            let parts = rest
                .split('/')
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>();
            if parts.len() != 1 {
                return Ok(None);
            }
            let name = decode_path_segment(parts[0]);
            validate_store_key("name", &name)?;
            return Ok(Some(ResourceRoute {
                kind,
                scope,
                name: Some(name),
            }));
        }
    }

    Ok(None)
}

fn name_from_item(item: &Value) -> Result<String> {
    item.get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .ok_or_else(|| Error::RustError("resource item must include a string name".to_string()))
}

fn item_with_name(mut item: Value, name: &str) -> Value {
    match &mut item {
        Value::Object(object) => {
            object.insert("name".to_string(), Value::String(name.to_string()));
            item
        }
        _ => {
            let mut object = Map::new();
            object.insert("name".to_string(), Value::String(name.to_string()));
            object.insert("value".to_string(), item);
            Value::Object(object)
        }
    }
}

fn merge_item(current: Value, patch: Value) -> Value {
    match (current, patch) {
        (Value::Object(mut current), Value::Object(patch)) => {
            for (key, value) in patch {
                current.insert(key, value);
            }
            Value::Object(current)
        }
        (_, patch) => patch,
    }
}

fn record_to_item(record: StoreRecord) -> Value {
    record.value
}
