use worker::{Error, Fetch, Result};

const MAX_REMOTE_SUBSCRIPTION_BYTES: usize = 4 * 1024 * 1024;

pub async fn fetch_remote_subscription(url: &str) -> Result<String> {
    let parsed = ::url::Url::parse(url).map_err(|_| Error::RustError("invalid url".to_string()))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(Error::RustError(
            "remote subscription url must use http or https".to_string(),
        ));
    }

    let mut response = Fetch::Url(parsed).send().await?;
    let status = response.status_code();
    if !(200..=299).contains(&status) {
        return Err(Error::RustError(format!(
            "remote subscription fetch failed with status {}",
            status
        )));
    }
    if let Some(length) = response.headers().get("content-length")? {
        if length.parse::<usize>().unwrap_or(0) > MAX_REMOTE_SUBSCRIPTION_BYTES {
            return Err(Error::RustError(format!(
                "remote subscription exceeds {} bytes",
                MAX_REMOTE_SUBSCRIPTION_BYTES
            )));
        }
    }

    let content = response.text().await?;
    if content.len() > MAX_REMOTE_SUBSCRIPTION_BYTES {
        return Err(Error::RustError(format!(
            "remote subscription exceeds {} bytes",
            MAX_REMOTE_SUBSCRIPTION_BYTES
        )));
    }
    Ok(content)
}
