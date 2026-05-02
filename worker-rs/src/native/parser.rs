use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use url::Url;

use super::model::{ParseResponse, ParseStats, ProxyNode, ProxyProtocol};

pub fn parse_subscription(content: &str) -> ParseResponse {
    let expanded = expand_subscription_content(content);
    let mut warnings = Vec::new();
    let mut stats = ParseStats {
        input_lines: expanded.len(),
        ..ParseStats::default()
    };
    let mut seen = HashSet::new();
    let mut nodes = Vec::new();

    for line in expanded {
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
}
