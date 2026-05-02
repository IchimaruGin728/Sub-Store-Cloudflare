use super::model::{ExportResponse, ProxyNode};
use super::parser::parse_subscription;

pub fn export_subscription(content: &str, target: Option<&str>) -> ExportResponse {
    let parsed = parse_subscription(content);
    let target = target.unwrap_or("json");
    let content = match target {
        "uri-list" | "uris" | "raw" => export_uri_list(&parsed.nodes),
        _ => serde_json::to_string_pretty(&parsed.nodes).unwrap_or_else(|_| "[]".to_string()),
    };

    ExportResponse {
        target: target.to_string(),
        content,
        stats: parsed.stats,
        warnings: parsed.warnings,
    }
}

fn export_uri_list(nodes: &[ProxyNode]) -> String {
    nodes
        .iter()
        .map(|node| node.source.as_str())
        .collect::<Vec<_>>()
        .join("\n")
}
