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
    pub processors: Option<ProcessorOptions>,
}

#[derive(Debug, Deserialize)]
pub struct ProcessRequest {
    pub content: String,
    pub processors: ProcessorOptions,
}

#[derive(Debug, Deserialize)]
pub struct RemoteSubscriptionRequest {
    pub url: String,
    pub target: Option<String>,
    pub processors: Option<ProcessorOptions>,
}

#[derive(Debug, Serialize)]
pub struct CapabilitiesResponse {
    pub parser: ParserCapabilities,
    pub processors: Vec<&'static str>,
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

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessorOptions {
    pub dedupe: Option<bool>,
    #[serde(rename = "dedupeBy")]
    pub dedupe_by: Option<String>,
    pub filter: Option<FilterOptions>,
    pub rename: Option<RenameOptions>,
    pub flag: Option<FlagOptions>,
    pub tag: Option<TagOptions>,
    pub sort: Option<SortOptions>,
    pub limit: Option<usize>,
    pub reverse: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterOptions {
    pub include: Option<String>,
    pub exclude: Option<String>,
    pub protocol: Option<String>,
    pub server: Option<String>,
    pub network: Option<String>,
    pub tls: Option<bool>,
    pub case_sensitive: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameOptions {
    pub prefix: Option<String>,
    pub suffix: Option<String>,
    pub replace: Option<String>,
    pub with: Option<String>,
    pub regex: Option<bool>,
    pub template: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagOptions {
    pub enabled: Option<bool>,
    pub position: Option<String>,
    pub separator: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagOptions {
    pub protocol: Option<bool>,
    pub network: Option<bool>,
    pub tls: Option<bool>,
    pub separator: Option<String>,
    pub position: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct SortOptions {
    pub by: Option<String>,
    pub desc: Option<bool>,
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
    ShadowsocksR,
    Vmess,
    Vless,
    Trojan,
    Hysteria,
    Hysteria2,
    Http,
    Socks5,
    Snell,
    Tuic,
    AnyTls,
    WireGuard,
    Ssh,
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
            inputs: vec![
                "plain-uri-list",
                "base64-uri-list",
                "clash-yaml",
                "sing-box-json",
                "surge-proxy-lines",
                "loon-proxy-lines",
                "quantumult-x-lines",
            ],
            schemes: vec![
                "ss",
                "vmess",
                "vless",
                "trojan",
                "hysteria",
                "hysteria2",
                "hy2",
                "tuic",
                "anytls",
                "socks",
                "socks5",
            ],
            native: true,
        },
        processors: vec![
            "dedupe", "filter", "rename", "flag", "tag", "sort", "limit", "reverse",
        ],
        exporters: vec![
            "json",
            "uri-list",
            "v2ray",
            "clash",
            "clash-meta",
            "mihomo",
            "stash",
            "sing-box",
            "surge",
            "surge-mac",
            "loon",
            "quantumult-x",
            "shadowrocket",
            "surfboard",
            "egern",
        ],
    }
}
