use serde::{Deserialize, Serialize};
use serde_json::Value;
use worker::{query, Date, Env, Error, Method, Request, Response, Result};

pub const STORE_DB_BINDING: &str = "SUB_STORE_DB";
const JWT_SECRET_BINDING: &str = "JWT_SECRET_STORE";

#[derive(Debug, Deserialize)]
pub struct StoreWriteRequest {
    pub value: Value,
}

#[derive(Debug, Deserialize)]
struct StoreRow {
    scope: String,
    name: String,
    value: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct StoreRecord {
    pub scope: String,
    pub name: String,
    pub value: Value,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
struct StoreInitResponse {
    ok: bool,
    binding: &'static str,
}

#[derive(Debug, Serialize)]
struct StoreRecordResponse {
    ok: bool,
    record: StoreRecord,
}

#[derive(Debug, Serialize)]
struct StoreListResponse {
    ok: bool,
    records: Vec<StoreRecord>,
}

#[derive(Debug, Serialize)]
struct StoreDeleteResponse {
    ok: bool,
    scope: String,
    name: String,
    deleted: bool,
}

pub async fn handle_store_request(mut req: Request, env: &Env, path: &str) -> Result<Response> {
    if !is_owner(&req, env).await? {
        return Response::error("Unauthorized", 401);
    }
    let db = env.d1(STORE_DB_BINDING)?;

    if path == "/api/native/store/init" {
        ensure_schema(&db).await?;
        return Response::from_json(&StoreInitResponse {
            ok: true,
            binding: STORE_DB_BINDING,
        });
    }

    let Some(rest) = path.strip_prefix("/api/native/store/") else {
        return Response::error("Not Found", 404);
    };
    let parts = rest
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.is_empty() || parts.len() > 2 {
        return Response::error("Not Found", 404);
    }

    ensure_schema(&db).await?;
    let scope = decode_path_segment(parts[0]);
    validate_store_key("scope", &scope)?;

    match (req.method(), parts.as_slice()) {
        (Method::Get, [_]) => Response::from_json(&StoreListResponse {
            ok: true,
            records: list_records(&db, &scope).await?,
        }),
        (Method::Get, [_, name]) => {
            let name = decode_path_segment(name);
            validate_store_key("name", &name)?;
            match get_record(&db, &scope, &name).await? {
                Some(record) => Response::from_json(&StoreRecordResponse { ok: true, record }),
                None => Response::error("Not Found", 404),
            }
        }
        (Method::Post | Method::Put, [_, name]) => {
            let name = decode_path_segment(name);
            validate_store_key("name", &name)?;
            let body: StoreWriteRequest = req.json().await?;
            let record = upsert_record(&db, &scope, &name, body.value).await?;
            Response::from_json(&StoreRecordResponse { ok: true, record })
        }
        (Method::Delete, [_, name]) => {
            let name = decode_path_segment(name);
            validate_store_key("name", &name)?;
            let deleted = delete_record(&db, &scope, &name).await?;
            Response::from_json(&StoreDeleteResponse {
                ok: true,
                scope,
                name,
                deleted,
            })
        }
        _ => Response::error("Method Not Allowed", 405),
    }
}

pub async fn is_owner(req: &Request, env: &Env) -> Result<bool> {
    let Some(expected) = env.secret_store(JWT_SECRET_BINDING)?.get().await? else {
        return Ok(false);
    };
    let auth = req
        .headers()
        .get("authorization")?
        .and_then(|value| value.strip_prefix("Bearer ").map(str::to_string))
        .or_else(|| req.headers().get("x-sub-store-token").ok().flatten());

    Ok(auth.as_deref() == Some(expected.as_str()))
}

pub async fn ensure_schema(db: &worker::d1::D1Database) -> Result<()> {
    db.exec(
        r#"
CREATE TABLE IF NOT EXISTS store_records (
  scope TEXT NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, name)
);
CREATE INDEX IF NOT EXISTS idx_store_records_scope_updated_at
  ON store_records(scope, updated_at DESC);
"#,
    )
    .await?;
    Ok(())
}

pub async fn list_records(db: &worker::d1::D1Database, scope: &str) -> Result<Vec<StoreRecord>> {
    let result = query!(
        db,
        "SELECT scope, name, value, created_at, updated_at FROM store_records WHERE scope = ?1 ORDER BY updated_at DESC, name ASC",
        scope,
    )?
    .all()
    .await?;
    rows_to_records(result.results::<StoreRow>()?)
}

pub async fn get_record(
    db: &worker::d1::D1Database,
    scope: &str,
    name: &str,
) -> Result<Option<StoreRecord>> {
    let row = query!(
        db,
        "SELECT scope, name, value, created_at, updated_at FROM store_records WHERE scope = ?1 AND name = ?2",
        scope,
        name,
    )?
    .first::<StoreRow>(None)
    .await?;
    row.map(row_to_record).transpose()
}

pub async fn upsert_record(
    db: &worker::d1::D1Database,
    scope: &str,
    name: &str,
    value: Value,
) -> Result<StoreRecord> {
    let now = Date::now().as_millis().to_string();
    let value = serde_json::to_string(&value)?;
    query!(
        db,
        "INSERT INTO store_records(scope, name, value, created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(scope, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        scope,
        name,
        value,
        now,
    )?
    .run()
    .await?;

    get_record(db, scope, name)
        .await?
        .ok_or_else(|| Error::RustError("record was not written".to_string()))
}

pub async fn delete_record(db: &worker::d1::D1Database, scope: &str, name: &str) -> Result<bool> {
    let result = query!(
        db,
        "DELETE FROM store_records WHERE scope = ?1 AND name = ?2",
        scope,
        name,
    )?
    .run()
    .await?;
    Ok(result
        .meta()?
        .and_then(|meta| meta.changes)
        .unwrap_or_default()
        > 0)
}

pub async fn delete_scope(db: &worker::d1::D1Database, scope: &str) -> Result<usize> {
    let result = query!(db, "DELETE FROM store_records WHERE scope = ?1", scope,)?
        .run()
        .await?;
    Ok(result
        .meta()?
        .and_then(|meta| meta.changes)
        .unwrap_or_default())
}

fn rows_to_records(rows: Vec<StoreRow>) -> Result<Vec<StoreRecord>> {
    rows.into_iter().map(row_to_record).collect()
}

fn row_to_record(row: StoreRow) -> Result<StoreRecord> {
    Ok(StoreRecord {
        scope: row.scope,
        name: row.name,
        value: serde_json::from_str(&row.value)?,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

pub fn validate_store_key(label: &str, value: &str) -> Result<()> {
    if value.is_empty() || value.len() > 128 {
        return Err(Error::RustError(format!(
            "{} must be between 1 and 128 characters",
            label
        )));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
    {
        return Err(Error::RustError(format!(
            "{} may only contain ASCII letters, numbers, hyphen, underscore, and dot",
            label
        )));
    }
    Ok(())
}

pub fn decode_path_segment(input: &str) -> String {
    url::form_urlencoded::parse(input.as_bytes())
        .map(|(key, value)| {
            if value.is_empty() {
                key.into_owned()
            } else {
                format!("{}={}", key, value)
            }
        })
        .collect::<Vec<_>>()
        .join("&")
}
