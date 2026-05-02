use super::model::ProxyProtocol;
use super::model::{ExportResponse, ProxyNode};
use super::parser::parse_subscription;
use super::process::process_nodes;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Map, Value};

pub fn export_subscription_with_processors(
    content: &str,
    target: Option<&str>,
    processors: Option<&super::model::ProcessorOptions>,
) -> ExportResponse {
    let parsed = parse_subscription(content);
    let (nodes, processor_warnings, processor_deduped) = processors
        .map(|options| process_nodes(parsed.nodes.clone(), options))
        .unwrap_or((parsed.nodes.clone(), Vec::new(), 0));
    let target = target.unwrap_or("json");
    let content = match target {
        "uri-list" | "uris" | "raw" => export_uri_list(&nodes),
        "v2ray" => STANDARD.encode(export_uri_list(&nodes)),
        "clash" | "clash-yaml" => export_clash_yaml(&nodes),
        "clash-meta" | "mihomo" | "stash" => export_clash_yaml(&nodes),
        "sing-box" | "singbox" => export_sing_box_json(&nodes),
        "surge" | "surge-mac" | "surgemac" => export_named_lines(&nodes, named_line_surge),
        "loon" => export_named_lines(&nodes, named_line_loon),
        "quantumult-x" | "qx" => export_named_lines(&nodes, named_line_quantumult_x),
        "shadowrocket" | "surfboard" | "egern" => export_uri_list(&nodes),
        _ => serde_json::to_string_pretty(&nodes).unwrap_or_else(|_| "[]".to_string()),
    };
    let mut stats = parsed.stats;
    stats.parsed = nodes.len();
    stats.deduped += processor_deduped;
    let mut warnings = parsed.warnings;
    warnings.extend(processor_warnings);

    ExportResponse {
        target: target.to_string(),
        content,
        stats,
        warnings,
    }
}

fn export_uri_list(nodes: &[ProxyNode]) -> String {
    nodes
        .iter()
        .map(canonical_uri)
        .collect::<Vec<_>>()
        .join("\n")
}

fn export_named_lines(nodes: &[ProxyNode], renderer: fn(&ProxyNode) -> Option<String>) -> String {
    nodes
        .iter()
        .filter_map(renderer)
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
            ProxyProtocol::ShadowsocksR => {
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
            ProxyProtocol::Trojan
            | ProxyProtocol::Hysteria
            | ProxyProtocol::Hysteria2
            | ProxyProtocol::Snell
            | ProxyProtocol::Tuic
            | ProxyProtocol::AnyTls => {
                push_yaml_opt(&mut out, "password", node.password.as_deref());
                if matches!(node.protocol, ProxyProtocol::Hysteria2) && node.tls == Some(false) {
                    out.push_str("    tls: false\n");
                }
            }
            ProxyProtocol::Http | ProxyProtocol::Socks5 | ProxyProtocol::Ssh => {
                push_yaml_opt(&mut out, "username", node.username.as_deref());
                push_yaml_opt(&mut out, "password", node.password.as_deref());
            }
            ProxyProtocol::WireGuard => {
                push_yaml_opt(&mut out, "private-key", node.password.as_deref());
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
        ProxyProtocol::ShadowsocksR => {
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
        ProxyProtocol::Hysteria => {
            outbound.insert(
                "password".to_string(),
                Value::String(node.password.clone().unwrap_or_default()),
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
        ProxyProtocol::Http | ProxyProtocol::Socks5 | ProxyProtocol::Ssh => {
            if let Some(username) = &node.username {
                outbound.insert("username".to_string(), Value::String(username.clone()));
            }
            if let Some(password) = &node.password {
                outbound.insert("password".to_string(), Value::String(password.clone()));
            }
            insert_tls(&mut outbound, node, false);
        }
        ProxyProtocol::Snell | ProxyProtocol::Tuic | ProxyProtocol::AnyTls => {
            if let Some(password) = &node.password {
                outbound.insert("password".to_string(), Value::String(password.clone()));
            }
            insert_tls(&mut outbound, node, true);
        }
        ProxyProtocol::WireGuard => {
            outbound.insert(
                "private_key".to_string(),
                Value::String(node.password.clone().unwrap_or_default()),
            );
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
        ProxyProtocol::ShadowsocksR => "ssr",
        ProxyProtocol::Vmess => "vmess",
        ProxyProtocol::Vless => "vless",
        ProxyProtocol::Trojan => "trojan",
        ProxyProtocol::Hysteria => "hysteria",
        ProxyProtocol::Hysteria2 => "hysteria2",
        ProxyProtocol::Http => "http",
        ProxyProtocol::Socks5 => "socks5",
        ProxyProtocol::Snell => "snell",
        ProxyProtocol::Tuic => "tuic",
        ProxyProtocol::AnyTls => "anytls",
        ProxyProtocol::WireGuard => "wireguard",
        ProxyProtocol::Ssh => "ssh",
    }
}

fn sing_box_type(node: &ProxyNode) -> Option<&'static str> {
    match node.protocol {
        ProxyProtocol::Shadowsocks => Some("shadowsocks"),
        ProxyProtocol::ShadowsocksR => Some("shadowsocksr"),
        ProxyProtocol::Vmess => Some("vmess"),
        ProxyProtocol::Vless => Some("vless"),
        ProxyProtocol::Trojan => Some("trojan"),
        ProxyProtocol::Hysteria => Some("hysteria"),
        ProxyProtocol::Hysteria2 => Some("hysteria2"),
        ProxyProtocol::Http => Some("http"),
        ProxyProtocol::Socks5 => Some("socks"),
        ProxyProtocol::Snell => None,
        ProxyProtocol::Tuic => Some("tuic"),
        ProxyProtocol::AnyTls => Some("anytls"),
        ProxyProtocol::WireGuard => Some("wireguard"),
        ProxyProtocol::Ssh => Some("ssh"),
    }
}

fn canonical_uri(node: &ProxyNode) -> String {
    if node.source.contains("://") {
        return node.source.clone();
    }
    match node.protocol {
        ProxyProtocol::Shadowsocks => {
            let user = format!(
                "{}:{}",
                node.cipher.as_deref().unwrap_or("aes-128-gcm"),
                node.password.as_deref().unwrap_or("")
            );
            format!(
                "ss://{}@{}:{}#{}",
                pct(&user),
                node.server,
                node.port,
                pct(&node.name)
            )
        }
        ProxyProtocol::Vless => format!(
            "vless://{}@{}:{}{}#{}",
            node.uuid.as_deref().unwrap_or(""),
            node.server,
            node.port,
            uri_query(node),
            pct(&node.name)
        ),
        ProxyProtocol::Trojan => format!(
            "trojan://{}@{}:{}{}#{}",
            pct(node.password.as_deref().unwrap_or("")),
            node.server,
            node.port,
            uri_query(node),
            pct(&node.name)
        ),
        ProxyProtocol::Hysteria2 => format!(
            "hy2://{}@{}:{}{}#{}",
            pct(node.password.as_deref().unwrap_or("")),
            node.server,
            node.port,
            uri_query(node),
            pct(&node.name)
        ),
        _ => format!("{} = {}", node.name, named_common(node, clash_type(node))),
    }
}

fn named_line_surge(node: &ProxyNode) -> Option<String> {
    Some(format!(
        "{} = {}",
        node.name,
        named_common(node, surge_type(node)?)
    ))
}

fn named_line_loon(node: &ProxyNode) -> Option<String> {
    Some(format!(
        "{} = {}",
        node.name,
        named_common(node, loon_type(node)?)
    ))
}

fn named_line_quantumult_x(node: &ProxyNode) -> Option<String> {
    let tag = format!(",tag={}", node.name);
    match node.protocol {
        ProxyProtocol::Shadowsocks => Some(format!(
            "shadowsocks={}:{},method={},password={}{}",
            node.server,
            node.port,
            node.cipher.as_deref().unwrap_or("aes-128-gcm"),
            node.password.as_deref().unwrap_or(""),
            tag
        )),
        ProxyProtocol::Vmess => Some(format!(
            "vmess={}:{},method={},password={},aead=false{}",
            node.server,
            node.port,
            node.cipher.as_deref().unwrap_or("auto"),
            node.uuid.as_deref().unwrap_or(""),
            tag
        )),
        ProxyProtocol::Trojan => Some(format!(
            "trojan={}:{},password={}{}",
            node.server,
            node.port,
            node.password.as_deref().unwrap_or(""),
            tag
        )),
        _ => None,
    }
}

fn named_common(node: &ProxyNode, type_name: &str) -> String {
    let mut parts = vec![
        type_name.to_string(),
        node.server.clone(),
        node.port.to_string(),
    ];
    match node.protocol {
        ProxyProtocol::Shadowsocks | ProxyProtocol::ShadowsocksR => {
            parts.push(format!(
                "encrypt-method={}",
                node.cipher.as_deref().unwrap_or("aes-128-gcm")
            ));
            parts.push(format!(
                "password={}",
                node.password.as_deref().unwrap_or("")
            ));
        }
        ProxyProtocol::Vmess | ProxyProtocol::Vless => {
            parts.push(format!("username={}", node.uuid.as_deref().unwrap_or("")));
        }
        ProxyProtocol::Trojan
        | ProxyProtocol::Hysteria
        | ProxyProtocol::Hysteria2
        | ProxyProtocol::Snell
        | ProxyProtocol::Tuic
        | ProxyProtocol::AnyTls => {
            parts.push(format!(
                "password={}",
                node.password.as_deref().unwrap_or("")
            ));
        }
        ProxyProtocol::Http | ProxyProtocol::Socks5 | ProxyProtocol::Ssh => {
            if let Some(username) = &node.username {
                parts.push(format!("username={}", username));
            }
            if let Some(password) = &node.password {
                parts.push(format!("password={}", password));
            }
        }
        ProxyProtocol::WireGuard => {
            parts.push(format!(
                "private-key={}",
                node.password.as_deref().unwrap_or("")
            ));
        }
    }
    if node.tls == Some(true) {
        parts.push("tls=true".to_string());
    }
    if let Some(network) = &node.network {
        parts.push(format!("network={}", network));
    }
    parts.join(", ")
}

fn surge_type(node: &ProxyNode) -> Option<&'static str> {
    Some(match node.protocol {
        ProxyProtocol::Shadowsocks => "ss",
        ProxyProtocol::ShadowsocksR => "ssr",
        ProxyProtocol::Vmess => "vmess",
        ProxyProtocol::Trojan => "trojan",
        ProxyProtocol::Hysteria2 => "hysteria2",
        ProxyProtocol::Http => "http",
        ProxyProtocol::Socks5 => "socks5",
        ProxyProtocol::Snell => "snell",
        ProxyProtocol::Tuic => "tuic",
        ProxyProtocol::WireGuard => "wireguard",
        ProxyProtocol::Ssh => "ssh",
        ProxyProtocol::Vless | ProxyProtocol::Hysteria | ProxyProtocol::AnyTls => return None,
    })
}

fn loon_type(node: &ProxyNode) -> Option<&'static str> {
    Some(match node.protocol {
        ProxyProtocol::Shadowsocks => "shadowsocks",
        ProxyProtocol::ShadowsocksR => "shadowsocksr",
        ProxyProtocol::Vmess => "vmess",
        ProxyProtocol::Vless => "vless",
        ProxyProtocol::Trojan => "trojan",
        ProxyProtocol::Hysteria2 => "hysteria2",
        ProxyProtocol::Http => "http",
        ProxyProtocol::Socks5 => "socks5",
        ProxyProtocol::WireGuard => "wireguard",
        ProxyProtocol::Snell
        | ProxyProtocol::Tuic
        | ProxyProtocol::Hysteria
        | ProxyProtocol::AnyTls
        | ProxyProtocol::Ssh => return None,
    })
}

fn uri_query(node: &ProxyNode) -> String {
    let mut params = node.params.clone();
    if let Some(network) = &node.network {
        params.insert("type".to_string(), network.clone());
    }
    if node.tls == Some(true) {
        params.insert("security".to_string(), "tls".to_string());
    }
    if params.is_empty() {
        return String::new();
    }
    format!(
        "?{}",
        params
            .iter()
            .map(|(key, value)| format!("{}={}", pct(key), pct(value)))
            .collect::<Vec<_>>()
            .join("&")
    )
}

fn pct(input: &str) -> String {
    url::form_urlencoded::byte_serialize(input.as_bytes()).collect()
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
        let exported = export_subscription_with_processors(
            "ss://aes-128-gcm:secret@example.com:8388#HK",
            Some("clash"),
            None,
        );
        assert!(exported.content.contains("proxies:"));
        assert!(exported.content.contains("type: ss"));
        assert!(exported.content.contains("cipher: aes-128-gcm"));
    }

    #[test]
    fn exports_sing_box_json() {
        let exported = export_subscription_with_processors(
            "trojan://pass@example.com:443?security=tls&sni=sg.example.com#SG",
            Some("sing-box"),
            None,
        );
        let value: Value = serde_json::from_str(&exported.content).expect("valid json");
        assert_eq!(value["outbounds"][0]["type"], "trojan");
        assert_eq!(value["outbounds"][0]["tls"]["enabled"], true);
        assert_eq!(
            value["outbounds"][0]["tls"]["server_name"],
            "sg.example.com"
        );
    }

    #[test]
    fn exports_major_client_targets() {
        let content = "ss://aes-128-gcm:secret@example.com:8388#HK";
        for target in [
            "v2ray",
            "clash-meta",
            "mihomo",
            "stash",
            "surge",
            "surge-mac",
            "loon",
            "quantumult-x",
            "shadowrocket",
            "surfboard",
            "egern",
        ] {
            let exported = export_subscription_with_processors(content, Some(target), None);
            assert!(
                !exported.content.is_empty(),
                "target {target} should not be empty"
            );
        }
    }
}
