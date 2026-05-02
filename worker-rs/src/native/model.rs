use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Deserialize)]
pub struct ParseRequest {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct ExportRequest {
    pub content: String,
    pub target: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CapabilitiesResponse {
    pub parser: ParserCapabilities,
    pub exporters: Vec<&'static str>,
}

#[derive(Debug, Serialize)]
pub struct ParserCapabilities {
    pub inputs: Vec<&'static str>,
    pub schemes: Vec<&'static str>,
    pub native: bool,
}

#[derive(Debug, Serialize)]
pub struct ParseResponse {
    pub nodes: Vec<ProxyNode>,
    pub stats: ParseStats,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportResponse {
    pub target: String,
    pub content: String,
    pub stats: ParseStats,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProxyNode {
    pub id: String,
    pub name: String,
    pub protocol: ProxyProtocol,
    pub server: String,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uuid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cipher: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tls: Option<bool>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub params: BTreeMap<String, String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProxyProtocol {
    Shadowsocks,
    Vmess,
    Vless,
    Trojan,
    Hysteria2,
}

#[derive(Debug, Default, Clone, Serialize)]
pub struct ParseStats {
    pub input_lines: usize,
    pub parsed: usize,
    pub skipped: usize,
    pub deduped: usize,
}

pub fn capabilities() -> CapabilitiesResponse {
    CapabilitiesResponse {
        parser: ParserCapabilities {
            inputs: vec!["plain-uri-list", "base64-uri-list"],
            schemes: vec!["ss", "vmess", "vless", "trojan", "hysteria2", "hy2"],
            native: true,
        },
        exporters: vec!["json", "uri-list", "clash", "sing-box"],
    }
}
