use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use url::Url;

use super::model::{ParseResponse, ParseStats, ProxyNode, ProxyProtocol};

pub fn parse_subscription(content: &str) -> ParseResponse {
    if let Some(nodes) = parse_structured_subscription(content) {
        return dedupe_nodes(nodes, content.lines().count().max(1));
    }

    let expanded = expand_subscription_content(content);
    parse_uri_lines(expanded)
}

fn dedupe_nodes(nodes: Vec<ProxyNode>, input_lines: usize) -> ParseResponse {
    let mut warnings = Vec::new();
    let mut stats = ParseStats {
        input_lines,
        ..ParseStats::default()
    };
    let mut seen = HashSet::new();
    let mut deduped_nodes = Vec::new();

    for node in nodes {
        let key = node_key(&node);
        if seen.insert(key) {
            stats.parsed += 1;
            deduped_nodes.push(node);
        } else {
            stats.deduped += 1;
        }
    }

    if deduped_nodes.is_empty() {
        warnings.push("no supported structured proxies found".to_string());
    }

    ParseResponse {
        nodes: deduped_nodes,
        stats,
        warnings,
    }
}

fn parse_uri_lines(lines: Vec<String>) -> ParseResponse {
    let mut warnings = Vec::new();
    let mut stats = ParseStats {
        input_lines: lines.len(),
        ..ParseStats::default()
    };
    let mut seen = HashSet::new();
    let mut nodes = Vec::new();

    for line in lines {
        match parse_proxy_uri(&line) {
            Some(node) => {
                let key = node_key(&node);
                if seen.insert(key) {
                    stats.parsed += 1;
                    nodes.push(node);
                } else {
                    stats.deduped += 1;
                }
            }
            None => {
                stats.skipped += 1;
                if warnings.len() < 20 {
                    warnings.push(format!("skipped unsupported line: {}", shorten(&line, 96)));
                }
            }
        }
    }

    ParseResponse {
        nodes,
        stats,
        warnings,
    }
}

fn parse_structured_subscription(content: &str) -> Option<Vec<ProxyNode>> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        if let Some(nodes) = parse_sing_box_json(&value) {
            return Some(nodes);
        }
        if let Some(nodes) = parse_clash_value(&value) {
            return Some(nodes);
        }
    }

    let yaml_value = serde_yaml::from_str::<serde_yaml::Value>(trimmed).ok()?;
    let value = serde_json::to_value(yaml_value).ok()?;
    parse_clash_value(&value)
}

fn parse_clash_value(value: &Value) -> Option<Vec<ProxyNode>> {
    let proxies = value.get("proxies")?.as_array()?;
    Some(
        proxies
            .iter()
            .filter_map(parse_clash_proxy)
            .collect::<Vec<_>>(),
    )
}

fn parse_sing_box_json(value: &Value) -> Option<Vec<ProxyNode>> {
    let outbounds = value.get("outbounds")?.as_array()?;
    Some(
        outbounds
            .iter()
            .filter_map(parse_sing_box_outbound)
            .collect::<Vec<_>>(),
    )
}

fn parse_clash_proxy(value: &Value) -> Option<ProxyNode> {
    let type_name = value.get("type")?.as_str()?;
    let protocol = protocol_from_clash_type(type_name)?;
    let server = string_field(value, "server")?;
    let port = u16_field(value, "port")?;
    let name = string_field(value, "name").unwrap_or_else(|| server.clone());
    let cipher = string_field(value, "cipher");
    let password = string_field(value, "password")
        .or_else(|| string_field(value, "private-key"))
        .or_else(|| string_field(value, "psk"));
    let uuid = string_field(value, "uuid").or_else(|| string_field(value, "id"));
    let network = string_field(value, "network");
    let tls = bool_field(value, "tls");
    let mut params = BTreeMap::new();

    for key in ["sni", "servername", "peer"] {
        if let Some(value) = string_field(value, key) {
            params.insert(key.to_string(), value);
        }
    }

    if let Some(ws_opts) = value.get("ws-opts") {
        if let Some(path) = string_field(ws_opts, "path") {
            params.insert("path".to_string(), path);
        }
        if let Some(host) = ws_opts.get("headers").and_then(|headers| {
            string_field(headers, "Host").or_else(|| string_field(headers, "host"))
        }) {
            params.insert("host".to_string(), host);
        }
    }

    Some(ProxyNode {
        id: stable_id(
            &protocol,
            &server,
            port,
            uuid.as_deref().or(password.as_deref()).unwrap_or(""),
        ),
        name,
        protocol,
        server,
        port,
        username: None,
        password,
        uuid,
        cipher,
        network,
        tls,
        params,
        source: serde_json::to_string(value).unwrap_or_default(),
    })
}

fn parse_sing_box_outbound(value: &Value) -> Option<ProxyNode> {
    let type_name = value.get("type")?.as_str()?;
    let protocol = protocol_from_sing_box_type(type_name)?;
    let server = string_field(value, "server")?;
    let port = u16_field(value, "server_port")?;
    let name = string_field(value, "tag").unwrap_or_else(|| server.clone());
    let cipher = string_field(value, "method").or_else(|| string_field(value, "security"));
    let password = string_field(value, "password")
        .or_else(|| string_field(value, "private_key"))
        .or_else(|| string_field(value, "pre_shared_key"));
    let uuid = string_field(value, "uuid");
    let mut params = BTreeMap::new();
    let tls = value
        .get("tls")
        .and_then(|tls| bool_field(tls, "enabled"))
        .or_else(|| match protocol {
            ProxyProtocol::Trojan | ProxyProtocol::Hysteria2 => Some(true),
            _ => None,
        });

    if let Some(tls_obj) = value.get("tls") {
        if let Some(server_name) = string_field(tls_obj, "server_name") {
            params.insert("sni".to_string(), server_name);
        }
    }

    let network = value
        .get("transport")
        .and_then(|transport| string_field(transport, "type"));
    if let Some(transport) = value.get("transport") {
        if let Some(path) = string_field(transport, "path") {
            params.insert("path".to_string(), path);
        }
    }

    Some(ProxyNode {
        id: stable_id(
            &protocol,
            &server,
            port,
            uuid.as_deref().or(password.as_deref()).unwrap_or(""),
        ),
        name,
        protocol,
        server,
        port,
        username: None,
        password,
        uuid,
        cipher,
        network,
        tls,
        params,
        source: serde_json::to_string(value).unwrap_or_default(),
    })
}

fn protocol_from_clash_type(type_name: &str) -> Option<ProxyProtocol> {
    match type_name {
        "ss" => Some(ProxyProtocol::Shadowsocks),
        "ssr" => Some(ProxyProtocol::ShadowsocksR),
        "vmess" => Some(ProxyProtocol::Vmess),
        "vless" => Some(ProxyProtocol::Vless),
        "trojan" => Some(ProxyProtocol::Trojan),
        "hysteria" => Some(ProxyProtocol::Hysteria),
        "hysteria2" | "hy2" => Some(ProxyProtocol::Hysteria2),
        "http" => Some(ProxyProtocol::Http),
        "socks5" | "socks" => Some(ProxyProtocol::Socks5),
        "snell" => Some(ProxyProtocol::Snell),
        "tuic" => Some(ProxyProtocol::Tuic),
        "anytls" => Some(ProxyProtocol::AnyTls),
        "wireguard" => Some(ProxyProtocol::WireGuard),
        "ssh" => Some(ProxyProtocol::Ssh),
        _ => None,
    }
}

fn protocol_from_sing_box_type(type_name: &str) -> Option<ProxyProtocol> {
    match type_name {
        "shadowsocks" => Some(ProxyProtocol::Shadowsocks),
        "shadowsocksr" => Some(ProxyProtocol::ShadowsocksR),
        "vmess" => Some(ProxyProtocol::Vmess),
        "vless" => Some(ProxyProtocol::Vless),
        "trojan" => Some(ProxyProtocol::Trojan),
        "hysteria" => Some(ProxyProtocol::Hysteria),
        "hysteria2" => Some(ProxyProtocol::Hysteria2),
        "http" => Some(ProxyProtocol::Http),
        "socks" | "socks5" => Some(ProxyProtocol::Socks5),
        "tuic" => Some(ProxyProtocol::Tuic),
        "anytls" => Some(ProxyProtocol::AnyTls),
        "wireguard" => Some(ProxyProtocol::WireGuard),
        "ssh" => Some(ProxyProtocol::Ssh),
        _ => None,
    }
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(|value| {
        value
            .as_str()
            .map(str::to_string)
            .or_else(|| value.as_u64().map(|n| n.to_string()))
            .or_else(|| value.as_i64().map(|n| n.to_string()))
            .or_else(|| value.as_bool().map(|b| b.to_string()))
    })
}

fn u16_field(value: &Value, key: &str) -> Option<u16> {
    parse_json_port(value.get(key)?)
}

fn bool_field(value: &Value, key: &str) -> Option<bool> {
    value.get(key).and_then(|value| {
        value.as_bool().or_else(|| {
            value
                .as_str()
                .map(|s| matches!(s, "true" | "1" | "tls" | "enabled"))
        })
    })
}

fn expand_subscription_content(content: &str) -> Vec<String> {
    let direct = split_lines(content);
    if direct.iter().any(|line| looks_like_proxy_uri(line)) {
        return direct;
    }

    if let Some(decoded) = decode_base64_text(content) {
        let decoded_lines = split_lines(&decoded);
        if decoded_lines.iter().any(|line| looks_like_proxy_uri(line)) {
            return decoded_lines;
        }
    }

    direct
}

fn split_lines(content: &str) -> Vec<String> {
    content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with('#'))
        .map(ToOwned::to_owned)
        .collect()
}

fn looks_like_proxy_uri(line: &str) -> bool {
    matches!(
        scheme_of(line),
        Some("ss")
            | Some("vmess")
            | Some("vless")
            | Some("trojan")
            | Some("hysteria2")
            | Some("hy2")
    )
}

fn scheme_of(line: &str) -> Option<&str> {
    line.split_once("://").map(|(scheme, _)| scheme)
}

fn parse_proxy_uri(line: &str) -> Option<ProxyNode> {
    match scheme_of(line)? {
        "ss" => parse_shadowsocks(line),
        "vmess" => parse_vmess(line),
        "vless" => parse_url_proxy(line, ProxyProtocol::Vless),
        "trojan" => parse_url_proxy(line, ProxyProtocol::Trojan),
        "hysteria2" | "hy2" => parse_url_proxy(line, ProxyProtocol::Hysteria2),
        _ => None,
    }
}

fn parse_url_proxy(line: &str, protocol: ProxyProtocol) -> Option<ProxyNode> {
    let url = Url::parse(line).ok()?;
    let server = url.host_str()?.to_string();
    let port = url.port_or_known_default()?;
    let name = fragment_or_host(&url);
    let mut params = query_params(&url);
    let username = non_empty_string(decode_percent(url.username()));
    let url_password = url.password().map(decode_percent);
    let tls = params
        .remove("security")
        .or_else(|| params.remove("tls"))
        .map(|value| matches!(value.as_str(), "tls" | "true" | "1"));
    let network = params.remove("type").or_else(|| params.remove("network"));
    let uuid = match protocol {
        ProxyProtocol::Vless => username.clone(),
        _ => None,
    };
    let password = match protocol {
        ProxyProtocol::Trojan | ProxyProtocol::Hysteria2 => username.clone().or(url_password),
        _ => url_password,
    };

    Some(ProxyNode {
        id: stable_id(&protocol, &server, port, username.as_deref().unwrap_or("")),
        name,
        protocol,
        server,
        port,
        username,
        password,
        uuid,
        cipher: None,
        network,
        tls,
        params,
        source: line.to_string(),
    })
}

fn parse_shadowsocks(line: &str) -> Option<ProxyNode> {
    if let Ok(url) = Url::parse(line) {
        if let Some(host) = url.host_str() {
            let cipher = decode_percent(url.username());
            let password = url.password().map(decode_percent)?;
            if cipher.is_empty() || password.is_empty() {
                return None;
            }
            let userinfo = format!("{}:{}", cipher, password);
            return Some(ProxyNode {
                id: stable_id(&ProxyProtocol::Shadowsocks, host, url.port()?, &userinfo),
                name: fragment_or_host(&url),
                protocol: ProxyProtocol::Shadowsocks,
                server: host.to_string(),
                port: url.port()?,
                username: None,
                password: Some(password),
                uuid: None,
                cipher: Some(cipher),
                network: None,
                tls: None,
                params: query_params(&url),
                source: line.to_string(),
            });
        }
    }

    let raw = line.strip_prefix("ss://")?;
    let (payload, fragment) = raw.split_once('#').unwrap_or((raw, ""));
    let decoded = decode_base64_text(payload)?;
    let (userinfo, endpoint) = decoded.rsplit_once('@')?;
    let (cipher, password) = split_once_owned(userinfo, ':')?;
    let (server, port_raw) = endpoint.rsplit_once(':')?;
    let port = port_raw.parse().ok()?;

    Some(ProxyNode {
        id: stable_id(&ProxyProtocol::Shadowsocks, server, port, userinfo),
        name: if fragment.is_empty() {
            server.to_string()
        } else {
            decode_percent(fragment)
        },
        protocol: ProxyProtocol::Shadowsocks,
        server: server.to_string(),
        port,
        username: None,
        password: Some(password),
        uuid: None,
        cipher: Some(cipher),
        network: None,
        tls: None,
        params: BTreeMap::new(),
        source: line.to_string(),
    })
}

fn parse_vmess(line: &str) -> Option<ProxyNode> {
    let payload = line.strip_prefix("vmess://")?;
    let decoded = decode_base64_text(payload)?;
    let value: Value = serde_json::from_str(&decoded).ok()?;
    let server = value.get("add")?.as_str()?.to_string();
    let port = parse_json_port(value.get("port")?)?;
    let uuid = value.get("id").and_then(Value::as_str).map(str::to_string);
    let name = value
        .get("ps")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .unwrap_or(&server)
        .to_string();
    let network = value.get("net").and_then(Value::as_str).map(str::to_string);
    let tls = value
        .get("tls")
        .and_then(Value::as_str)
        .map(|s| matches!(s, "tls" | "true" | "1"));

    Some(ProxyNode {
        id: stable_id(
            &ProxyProtocol::Vmess,
            &server,
            port,
            uuid.as_deref().unwrap_or(""),
        ),
        name,
        protocol: ProxyProtocol::Vmess,
        server,
        port,
        username: None,
        password: None,
        uuid,
        cipher: value.get("scy").and_then(Value::as_str).map(str::to_string),
        network,
        tls,
        params: BTreeMap::new(),
        source: line.to_string(),
    })
}

fn query_params(url: &Url) -> BTreeMap<String, String> {
    url.query_pairs()
        .map(|(key, value)| (key.to_string(), value.to_string()))
        .collect()
}

fn fragment_or_host(url: &Url) -> String {
    url.fragment()
        .map(decode_percent)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| url.host_str().unwrap_or("proxy").to_string())
}

fn decode_base64_text(input: &str) -> Option<String> {
    let clean = input.trim().replace(['\r', '\n', ' '], "");
    let padded = pad_base64(&clean);
    STANDARD
        .decode(padded.as_bytes())
        .or_else(|_| URL_SAFE_NO_PAD.decode(clean.as_bytes()))
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
}

fn pad_base64(input: &str) -> String {
    let mut output = input.to_string();
    let rem = output.len() % 4;
    if rem != 0 {
        output.push_str(&"=".repeat(4 - rem));
    }
    output
}

fn decode_percent(input: &str) -> String {
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

fn split_once_owned(input: &str, delimiter: char) -> Option<(String, String)> {
    let (left, right) = input.split_once(delimiter)?;
    Some((left.to_string(), right.to_string()))
}

fn non_empty_string(input: String) -> Option<String> {
    if input.is_empty() {
        None
    } else {
        Some(input)
    }
}

fn parse_json_port(value: &Value) -> Option<u16> {
    if let Some(port) = value.as_u64() {
        return u16::try_from(port).ok();
    }
    value.as_str()?.parse().ok()
}

fn node_key(node: &ProxyNode) -> String {
    format!(
        "{:?}|{}|{}|{}|{}",
        node.protocol,
        node.server,
        node.port,
        node.uuid.as_deref().unwrap_or(""),
        node.password.as_deref().unwrap_or("")
    )
}

fn stable_id(protocol: &ProxyProtocol, server: &str, port: u16, secret: &str) -> String {
    format!("{:?}:{}:{}:{}", protocol, server, port, secret)
}

fn shorten(input: &str, max: usize) -> String {
    if input.len() <= max {
        input.to_string()
    } else {
        format!("{}...", &input[..max])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sip002_shadowsocks() {
        let parsed = parse_subscription("ss://aes-128-gcm:secret@example.com:8388#HK");
        assert_eq!(parsed.stats.parsed, 1);
        let node = &parsed.nodes[0];
        assert_eq!(node.server, "example.com");
        assert_eq!(node.port, 8388);
        assert_eq!(node.name, "HK");
        assert_eq!(node.cipher.as_deref(), Some("aes-128-gcm"));
        assert_eq!(node.password.as_deref(), Some("secret"));
    }

    #[test]
    fn parses_base64_subscription_and_dedupes() {
        let line = "trojan://pass@example.com:443?security=tls&type=tcp#SG";
        let content = STANDARD.encode(format!("{}\n{}\n", line, line));
        let parsed = parse_subscription(&content);
        assert_eq!(parsed.stats.parsed, 1);
        assert_eq!(parsed.stats.deduped, 1);
        assert_eq!(parsed.nodes[0].name, "SG");
        assert_eq!(parsed.nodes[0].tls, Some(true));
    }

    #[test]
    fn parses_clash_yaml_proxies() {
        let parsed = parse_subscription(
            r#"
proxies:
  - name: HK
    type: ss
    server: example.com
    port: 8388
    cipher: aes-128-gcm
    password: secret
  - name: SG
    type: trojan
    server: sg.example.com
    port: 443
    password: pass
    sni: sni.example.com
"#,
        );
        assert_eq!(parsed.stats.parsed, 2);
        assert_eq!(parsed.nodes[0].cipher.as_deref(), Some("aes-128-gcm"));
        assert_eq!(
            parsed.nodes[1].params.get("sni").map(String::as_str),
            Some("sni.example.com")
        );
    }

    #[test]
    fn parses_sing_box_outbounds() {
        let parsed = parse_subscription(
            r#"
{
  "outbounds": [
    {
      "type": "vmess",
      "tag": "VMess",
      "server": "vmess.example.com",
      "server_port": 443,
      "uuid": "00000000-0000-0000-0000-000000000000",
      "security": "auto",
      "tls": { "enabled": true, "server_name": "tls.example.com" },
      "transport": { "type": "ws", "path": "/ws" }
    }
  ]
}
"#,
        );
        assert_eq!(parsed.stats.parsed, 1);
        assert_eq!(parsed.nodes[0].name, "VMess");
        assert_eq!(parsed.nodes[0].network.as_deref(), Some("ws"));
        assert_eq!(
            parsed.nodes[0].params.get("path").map(String::as_str),
            Some("/ws")
        );
    }
}
