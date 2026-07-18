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
    pub useless: Option<bool>,
    #[serde(rename = "regionFilter")]
    pub region_filter: Option<RegionFilterOptions>,
    #[serde(rename = "typeFilter")]
    pub type_filter: Option<TypeFilterOptions>,
    pub filter: Option<FilterOptions>,
    #[serde(rename = "regexFilter")]
    pub regex_filter: Option<RegexFilterOptions>,
    pub rename: Option<RenameOptions>,
    #[serde(rename = "regexRename")]
    pub regex_rename: Option<RegexRenameOptions>,
    pub delete: Option<DeleteOptions>,
    pub flag: Option<FlagOptions>,
    pub tag: Option<TagOptions>,
    pub set: Option<SetOptions>,
    pub sort: Option<SortOptions>,
    #[serde(rename = "regexSort")]
    pub regex_sort: Option<RegexSortOptions>,
    pub duplicate: Option<DuplicateOptions>,
    pub limit: Option<usize>,
    pub reverse: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegionFilterOptions {
    pub value: Option<Vec<String>>,
    pub regions: Option<Vec<String>>,
    pub keep: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TypeFilterOptions {
    pub value: Option<Vec<String>>,
    pub types: Option<Vec<String>>,
    pub keep: Option<bool>,
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
pub struct RegexFilterOptions {
    pub regex: Option<Vec<String>>,
    pub expressions: Option<Vec<String>>,
    pub keep: Option<bool>,
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
pub struct RegexRenameOptions {
    pub rules: Option<Vec<RegexRenameRule>>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexRenameRule {
    pub expr: String,
    pub now: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteOptions {
    pub patterns: Option<Vec<String>>,
    pub regex: Option<bool>,
    pub trim: Option<bool>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlagOptions {
    pub enabled: Option<bool>,
    pub mode: Option<String>,
    pub tw: Option<String>,
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
#[serde(rename_all = "camelCase")]
pub struct SetOptions {
    pub udp: Option<bool>,
    pub tfo: Option<bool>,
    #[serde(alias = "fast-open")]
    pub fast_open: Option<bool>,
    #[serde(alias = "skip-cert-verify")]
    pub skip_cert_verify: Option<bool>,
    #[serde(rename = "vmess aead", alias = "vmessAead")]
    pub vmess_aead: Option<bool>,
    pub tls: Option<bool>,
    pub network: Option<String>,
    pub server: Option<String>,
    pub port: Option<u16>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub struct SortOptions {
    pub by: Option<String>,
    pub desc: Option<bool>,
    pub order: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegexSortOptions {
    pub expressions: Option<Vec<String>>,
    pub order: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateOptions {
    pub action: Option<String>,
    pub template: Option<String>,
    pub link: Option<String>,
    pub position: Option<String>,
    pub field: Option<Vec<String>>,
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
            "dedupe",
            "useless-filter",
            "region-filter",
            "type-filter",
            "filter",
            "regex-filter",
            "rename",
            "regex-rename",
            "delete",
            "flag",
            "tag",
            "set",
            "sort",
            "regex-sort",
            "handle-duplicate",
            "limit",
            "reverse",
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
