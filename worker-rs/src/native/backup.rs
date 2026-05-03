use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use worker::{Date, Env, Error, Method, Request, Response, Result};

use crate::native::store::{
    delete_scope, ensure_schema, is_owner, list_records, upsert_record, validate_store_key,
    STORE_DB_BINDING,
};

const RESOURCE_SCOPES: [&str; 6] = [
    "subscriptions",
    "collections",
    "files",
    "artifacts",
    "settings",
    "tokens",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RestoreRequest {
    resources: Option<Map<String, Value>>,
    replace: Option<bool>,
}

#[derive(Debug, Serialize)]
struct BackupEnvelope {
    ok: bool,
    version: &'static str,
    exported_at: String,
    resources: Map<String, Value>,
}

#[derive(Debug, Serialize)]
struct RestoreResponse {
    ok: bool,
    restored: usize,
    replaced_scopes: Vec<String>,
}

pub async fn handle_backup_request(mut req: Request, env: &Env, path: &str) -> Result<Response> {
    if !is_owner(&req, env).await? {
        return Response::error("Unauthorized", 401);
    }
    let db = env.d1(STORE_DB_BINDING)?;
    ensure_schema(&db).await?;

    match (req.method(), path) {
        (Method::Get, "/api/backup") => export_backup(req, &db).await,
        (Method::Post | Method::Put, "/api/backup")
        | (Method::Post | Method::Put, "/api/backup/restore") => {
            restore_backup(&mut req, &db).await
        }
        _ => Response::error("Not Found", 404),
    }
}

pub fn is_backup_path(path: &str) -> bool {
    path == "/api/backup" || path == "/api/backup/restore"
}

async fn export_backup(req: Request, db: &worker::d1::D1Database) -> Result<Response> {
    let url = req.url()?;
    let selected = url
        .query_pairs()
        .filter_map(|(key, value)| (key == "scope").then(|| value.into_owned()))
        .collect::<Vec<_>>();
    let scopes = if selected.is_empty() {
        RESOURCE_SCOPES.to_vec()
    } else {
        selected
            .iter()
            .map(String::as_str)
            .filter(|scope| RESOURCE_SCOPES.contains(scope))
            .collect::<Vec<_>>()
    };

    let mut resources = Map::new();
    for scope in scopes {
        let records = list_records(db, scope).await?;
        resources.insert(
            scope.to_string(),
            Value::Array(records.into_iter().map(|record| record.value).collect()),
        );
    }

    Response::from_json(&BackupEnvelope {
        ok: true,
        version: "1",
        exported_at: Date::now().as_millis().to_string(),
        resources,
    })
}

async fn restore_backup(req: &mut Request, db: &worker::d1::D1Database) -> Result<Response> {
    let body = req.text().await?;
    let value: Value =
        serde_json::from_str(&body).map_err(|err| Error::RustError(err.to_string()))?;
    let restore = serde_json::from_value::<RestoreRequest>(value.clone()).ok();
    let resources = restore
        .as_ref()
        .and_then(|request| request.resources.clone())
        .or_else(|| value.get("resources").and_then(Value::as_object).cloned())
        .or_else(|| value.as_object().cloned())
        .ok_or_else(|| Error::RustError("backup restore body must be a JSON object".to_string()))?;
    let replace = restore.and_then(|request| request.replace).unwrap_or(false);

    let mut restored = 0;
    let mut replaced_scopes = Vec::new();
    for (scope, items) in resources {
        if !RESOURCE_SCOPES.contains(&scope.as_str()) {
            continue;
        }
        let Some(items) = items.as_array() else {
            continue;
        };
        if replace {
            delete_scope(db, &scope).await?;
            replaced_scopes.push(scope.clone());
        }
        for item in items {
            let Some(name) = item.get("name").and_then(Value::as_str) else {
                continue;
            };
            validate_store_key("name", name)?;
            upsert_record(db, &scope, name, item.clone()).await?;
            restored += 1;
        }
    }

    Response::from_json(&RestoreResponse {
        ok: true,
        restored,
        replaced_scopes,
    })
}
