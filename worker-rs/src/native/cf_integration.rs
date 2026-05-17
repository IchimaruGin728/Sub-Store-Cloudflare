use serde::Serialize;
use worker::{Env, Error, Result};

const KV_BINDING: &str = "SUB_STORE_CACHE";
const R2_BINDING: &str = "SUB_STORE_BACKUP";
const ANALYTICS_BINDING: &str = "ANALYTICS";

// KV Cache: Store compiled export results
pub async fn cache_export(env: &Env, key: &str, content: &str) -> Result<()> {
    let kv = env.kv(KV_BINDING)?;
    // Cache for 1 hour
    kv.put(key, content)?
        .expiration_ttl(3600)
        .execute()
        .await?;
    Ok(())
}

pub async fn get_cached_export(env: &Env, key: &str) -> Result<Option<String>> {
    let kv = env.kv(KV_BINDING)?;
    kv.get(key).text().await.map_err(|e| worker::Error::RustError(e.to_string()))
}

pub async fn invalidate_cache(env: &Env, key: &str) -> Result<()> {
    let kv = env.kv(KV_BINDING)?;
    kv.delete(key).await.map_err(|e| worker::Error::RustError(e.to_string()))?;
    Ok(())
}

// R2 Backup: Store large backup files
pub async fn store_backup(env: &Env, name: &str, data: &[u8]) -> Result<()> {
    let bucket = env.bucket(R2_BINDING)?;
    bucket.put(name, data.to_vec()).execute().await.map_err(|e| worker::Error::RustError(e.to_string()))?;
    Ok(())
}

pub async fn get_backup(env: &Env, name: &str) -> Result<Option<Vec<u8>>> {
    let bucket = env.bucket(R2_BINDING)?;
    match bucket.get(name).execute().await.map_err(|e| worker::Error::RustError(e.to_string()))? {
        Some(object) => {
            let body = object.body().ok_or_else(|| {
                Error::RustError("R2 object has no body".to_string())
            })?;
            let bytes = body.bytes().await.map_err(|e| worker::Error::RustError(e.to_string()))?;
            Ok(Some(bytes))
        }
        None => Ok(None),
    }
}

pub async fn list_backups(env: &Env) -> Result<Vec<String>> {
    let bucket = env.bucket(R2_BINDING)?;
    let objects = bucket.list().execute().await.map_err(|e| worker::Error::RustError(e.to_string()))?;
    let names = objects
        .objects()
        .iter()
        .filter_map(|obj| Some(obj.key().to_string()))
        .collect();
    Ok(names)
}

// Analytics Engine: Write custom metrics
#[derive(Debug, Serialize)]
pub struct MetricPoint {
    pub blobs: Vec<String>,
    pub doubles: Vec<f64>,
    pub indexes: Vec<String>,
}

pub fn write_metric(_env: &Env, _point: MetricPoint) -> Result<()> {
    // Analytics engine is not supported in this version of worker-rs
    Ok(())
}

// Helper: Write refresh metric
pub fn record_refresh(env: &Env, name: &str, kind: &str, success: bool, latency_ms: f64) {
    let _ = write_metric(
        env,
        MetricPoint {
            blobs: vec![
                "refresh".to_string(),
                name.to_string(),
                kind.to_string(),
                if success { "ok" } else { "fail" }.to_string(),
            ],
            doubles: vec![latency_ms],
            indexes: vec![],
        },
    );
}

// Helper: Write request metric
pub fn record_request(env: &Env, path: &str, status: u16, latency_ms: f64) {
    let _ = write_metric(
        env,
        MetricPoint {
            blobs: vec![
                "request".to_string(),
                path.to_string(),
                status.to_string(),
            ],
            doubles: vec![latency_ms],
            indexes: vec![],
        },
    );
}
