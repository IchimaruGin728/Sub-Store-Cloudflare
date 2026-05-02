use super::model::ProxyProtocol;
use super::model::{ExportResponse, ProxyNode};
use super::parser::parse_subscription;
use serde_json::{json, Map, Value};

pub fn export_subscription(content: &str, target: Option<&str>) -> ExportResponse {
    let parsed = parse_subscription(content);
    let target = target.unwrap_or("json");
    let content = match target {
        "uri-list" | "uris" | "raw" => export_uri_list(&parsed.nodes),
        "clash" | "clash-yaml" => export_clash_yaml(&parsed.nodes),
        "sing-box" | "singbox" => export_sing_box_json(&parsed.nodes),
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

fn export_clash_yaml(nodes: &[ProxyNode]) -> String {
    let mut out = String::from("proxies:\n");
    for node in nodes {
        out.push_str(&format!("  - name: {}\n", yaml_string(&node.name)));
        out.push_str(&format!("    type: {}\n", clash_type(node)));
        out.push_str(&format!("    server: {}\n", yaml_string(&node.server)));
        out.push_str(&format!("    port: {}\n", node.port));

        match node.protocol {
            ProxyProtocol::Shadowsocks => {
                push_yaml_opt(&mut out, "cipher", node.cipher.as_deref());
                push_yaml_opt(&mut out, "password", node.password.as_deref());
            }
            ProxyProtocol::Vmess => {
                push_yaml_opt(&mut out, "uuid", node.uuid.as_deref());
                out.push_str("    alterId: 0\n");
                push_yaml_opt(&mut out, "cipher", node.cipher.as_deref().or(Some("auto")));
                if node.tls == Some(true) {
                    out.push_str("    tls: true\n");
                }
            }
            ProxyProtocol::Vless => {
                push_yaml_opt(&mut out, "uuid", node.uuid.as_deref());
                if node.tls == Some(true) {
                    out.push_str("    tls: true\n");
                }
            }
            ProxyProtocol::Trojan | ProxyProtocol::Hysteria2 => {
                push_yaml_opt(&mut out, "password", node.password.as_deref());
                if matches!(node.protocol, ProxyProtocol::Hysteria2) && node.tls == Some(false) {
                    out.push_str("    tls: false\n");
                }
            }
        }

        push_yaml_opt(&mut out, "network", node.network.as_deref());
        if let Some(sni) = first_param(node, &["sni", "peer", "servername"]) {
            push_yaml_opt(&mut out, "sni", Some(sni));
        }
    }
    out
}

fn export_sing_box_json(nodes: &[ProxyNode]) -> String {
    let outbounds: Vec<Value> = nodes.iter().filter_map(sing_box_outbound).collect();
    serde_json::to_string_pretty(&json!({ "outbounds": outbounds }))
        .unwrap_or_else(|_| "{}".to_string())
}

fn sing_box_outbound(node: &ProxyNode) -> Option<Value> {
    let mut outbound = Map::new();
    outbound.insert(
        "type".to_string(),
        Value::String(sing_box_type(node)?.to_string()),
    );
    outbound.insert("tag".to_string(), Value::String(node.name.clone()));
    outbound.insert("server".to_string(), Value::String(node.server.clone()));
    outbound.insert("server_port".to_string(), json!(node.port));

    match node.protocol {
        ProxyProtocol::Shadowsocks => {
            outbound.insert("method".to_string(), Value::String(node.cipher.clone()?));
            outbound.insert(
                "password".to_string(),
                Value::String(node.password.clone()?),
            );
        }
        ProxyProtocol::Vmess => {
            outbound.insert("uuid".to_string(), Value::String(node.uuid.clone()?));
            outbound.insert(
                "security".to_string(),
                Value::String(node.cipher.clone().unwrap_or_else(|| "auto".to_string())),
            );
            outbound.insert("alter_id".to_string(), json!(0));
            insert_tls(&mut outbound, node, false);
        }
        ProxyProtocol::Vless => {
            outbound.insert("uuid".to_string(), Value::String(node.uuid.clone()?));
            insert_tls(&mut outbound, node, false);
        }
        ProxyProtocol::Trojan => {
            outbound.insert(
                "password".to_string(),
                Value::String(node.password.clone()?),
            );
            insert_tls(&mut outbound, node, true);
        }
        ProxyProtocol::Hysteria2 => {
            outbound.insert(
                "password".to_string(),
                Value::String(node.password.clone()?),
            );
            insert_tls(&mut outbound, node, true);
        }
    }

    if let Some(network) = &node.network {
        if network == "ws" {
            let mut transport = Map::new();
            transport.insert("type".to_string(), Value::String("ws".to_string()));
            if let Some(path) = first_param(node, &["path"]) {
                transport.insert("path".to_string(), Value::String(path.to_string()));
            }
            outbound.insert("transport".to_string(), Value::Object(transport));
        }
    }

    Some(Value::Object(outbound))
}

fn insert_tls(outbound: &mut Map<String, Value>, node: &ProxyNode, default_enabled: bool) {
    let enabled = node.tls.unwrap_or(default_enabled);
    if !enabled {
        return;
    }
    let mut tls = Map::new();
    tls.insert("enabled".to_string(), Value::Bool(true));
    if let Some(sni) = first_param(node, &["sni", "peer", "servername"]) {
        tls.insert("server_name".to_string(), Value::String(sni.to_string()));
    }
    outbound.insert("tls".to_string(), Value::Object(tls));
}

fn clash_type(node: &ProxyNode) -> &'static str {
    match node.protocol {
        ProxyProtocol::Shadowsocks => "ss",
        ProxyProtocol::Vmess => "vmess",
        ProxyProtocol::Vless => "vless",
        ProxyProtocol::Trojan => "trojan",
        ProxyProtocol::Hysteria2 => "hysteria2",
    }
}

fn sing_box_type(node: &ProxyNode) -> Option<&'static str> {
    match node.protocol {
        ProxyProtocol::Shadowsocks => Some("shadowsocks"),
        ProxyProtocol::Vmess => Some("vmess"),
        ProxyProtocol::Vless => Some("vless"),
        ProxyProtocol::Trojan => Some("trojan"),
        ProxyProtocol::Hysteria2 => Some("hysteria2"),
    }
}

fn first_param<'a>(node: &'a ProxyNode, keys: &[&str]) -> Option<&'a str> {
    keys.iter()
        .find_map(|key| node.params.get(*key).map(String::as_str))
        .filter(|value| !value.is_empty())
}

fn push_yaml_opt(out: &mut String, key: &str, value: Option<&str>) {
    if let Some(value) = value.filter(|value| !value.is_empty()) {
        out.push_str(&format!("    {}: {}\n", key, yaml_string(value)));
    }
}

fn yaml_string(input: &str) -> String {
    if input
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '/' | ':'))
    {
        input.to_string()
    } else {
        format!("\"{}\"", input.replace('\\', "\\\\").replace('"', "\\\""))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_clash_yaml() {
        let exported =
            export_subscription("ss://aes-128-gcm:secret@example.com:8388#HK", Some("clash"));
        assert!(exported.content.contains("proxies:"));
        assert!(exported.content.contains("type: ss"));
        assert!(exported.content.contains("cipher: aes-128-gcm"));
    }

    #[test]
    fn exports_sing_box_json() {
        let exported = export_subscription(
            "trojan://pass@example.com:443?security=tls&sni=sg.example.com#SG",
            Some("sing-box"),
        );
        let value: Value = serde_json::from_str(&exported.content).expect("valid json");
        assert_eq!(value["outbounds"][0]["type"], "trojan");
        assert_eq!(value["outbounds"][0]["tls"]["enabled"], true);
        assert_eq!(
            value["outbounds"][0]["tls"]["server_name"],
            "sg.example.com"
        );
    }
}
