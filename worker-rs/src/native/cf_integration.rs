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
    kv.get(key).text().await
}

pub async fn invalidate_cache(env: &Env, key: &str) -> Result<()> {
    let kv = env.kv(KV_BINDING)?;
    kv.delete(key).await?;
    Ok(())
}

// R2 Backup: Store large backup files
pub async fn store_backup(env: &Env, name: &str, data: &[u8]) -> Result<()> {
    let bucket = env.bucket(R2_BINDING)?;
    bucket.put(name, data.to_vec()).execute().await?;
    Ok(())
}

pub async fn get_backup(env: &Env, name: &str) -> Result<Option<Vec<u8>>> {
    let bucket = env.bucket(R2_BINDING)?;
    match bucket.get(name).execute().await? {
        Some(object) => {
            let body = object.body().ok_or_else(|| {
                Error::RustError("R2 object has no body".to_string())
            })?;
            let bytes = body.bytes().await?;
            Ok(Some(bytes))
        }
        None => Ok(None),
    }
}

pub async fn list_backups(env: &Env) -> Result<Vec<String>> {
    let bucket = env.bucket(R2_BINDING)?;
    let objects = bucket.list().execute().await?;
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

pub fn write_metric(env: &Env, point: MetricPoint) -> Result<()> {
    let analytics = env.analytics_engine(ANALYTICS_BINDING)?;
    analytics.write_data_point(worker::AnalyticsDataPoint {
        blobs: point.blobs.iter().map(|s| s.as_str()).collect(),
        doubles: point.doubles.clone(),
        indexes: point.indexes.iter().map(|s| s.as_str()).collect(),
    })?;
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
