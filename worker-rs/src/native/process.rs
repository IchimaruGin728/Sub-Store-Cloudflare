use regex::Regex;
use std::cmp::Ordering;
use std::collections::HashSet;

use super::model::{
    FlagOptions, ParseResponse, ParseStats, ProcessorOptions, ProxyNode, TagOptions,
};
use super::parser::parse_subscription;

pub fn process_subscription(content: &str, options: &ProcessorOptions) -> ParseResponse {
    let parsed = parse_subscription(content);
    let (nodes, mut warnings, deduped) = process_nodes(parsed.nodes, options);
    let stats = ParseStats {
        parsed: nodes.len(),
        deduped: parsed.stats.deduped + deduped,
        ..parsed.stats
    };
    warnings.extend(parsed.warnings);
    ParseResponse {
        nodes,
        stats,
        warnings,
    }
}

pub fn process_nodes(
    mut nodes: Vec<ProxyNode>,
    options: &ProcessorOptions,
) -> (Vec<ProxyNode>, Vec<String>, usize) {
    let mut warnings = Vec::new();
    let mut deduped = 0;

    if let Some(filter) = &options.filter {
        nodes.retain(|node| filter_node(node, filter));
    }

    if options.dedupe.unwrap_or(false) {
        let before = nodes.len();
        let mut seen = HashSet::new();
        let by = options.dedupe_by.as_deref().unwrap_or("endpoint");
        nodes.retain(|node| seen.insert(node_key(node, by)));
        deduped += before.saturating_sub(nodes.len());
    }

    if let Some(rename) = &options.rename {
        for node in &mut nodes {
            if let Err(message) = rename_node(node, rename) {
                warnings.push(message);
            }
        }
    }

    if let Some(flag) = &options.flag {
        for node in &mut nodes {
            apply_flag(node, flag);
        }
    }

    if let Some(tag) = &options.tag {
        for node in &mut nodes {
            apply_tag(node, tag);
        }
    }

    if let Some(sort) = &options.sort {
        let by = sort.by.as_deref().unwrap_or("name");
        nodes.sort_by(|a, b| compare_nodes(a, b, by));
        if sort.desc.unwrap_or(false) {
            nodes.reverse();
        }
    }

    if options.reverse.unwrap_or(false) {
        nodes.reverse();
    }

    if let Some(limit) = options.limit {
        nodes.truncate(limit);
    }

    (nodes, warnings, deduped)
}

fn filter_node(node: &ProxyNode, filter: &super::model::FilterOptions) -> bool {
    if let Some(protocol) = &filter.protocol {
        if !matches_text(
            &format!("{:?}", node.protocol),
            protocol,
            filter.case_sensitive,
        ) {
            return false;
        }
    }
    if let Some(server) = &filter.server {
        if !matches_text(&node.server, server, filter.case_sensitive) {
            return false;
        }
    }
    if let Some(network) = &filter.network {
        if !matches_text(
            node.network.as_deref().unwrap_or(""),
            network,
            filter.case_sensitive,
        ) {
            return false;
        }
    }
    if let Some(tls) = filter.tls {
        if node.tls.unwrap_or(false) != tls {
            return false;
        }
    }
    if let Some(include) = &filter.include {
        let haystack = node_search_text(node);
        if !matches_text(&haystack, include, filter.case_sensitive) {
            return false;
        }
    }
    if let Some(exclude) = &filter.exclude {
        let haystack = node_search_text(node);
        if matches_text(&haystack, exclude, filter.case_sensitive) {
            return false;
        }
    }
    true
}

fn rename_node(node: &mut ProxyNode, rename: &super::model::RenameOptions) -> Result<(), String> {
    let mut name = node.name.clone();
    if let Some(pattern) = &rename.replace {
        let replacement = rename.with.as_deref().unwrap_or("");
        if rename.regex.unwrap_or(false) {
            let re = Regex::new(pattern)
                .map_err(|err| format!("invalid rename regex `{}`: {}", pattern, err))?;
            name = re.replace_all(&name, replacement).to_string();
        } else {
            name = name.replace(pattern, replacement);
        }
    }
    if let Some(prefix) = &rename.prefix {
        name = format!("{}{}", prefix, name);
    }
    if let Some(suffix) = &rename.suffix {
        name = format!("{}{}", name, suffix);
    }
    if let Some(template) = &rename.template {
        name = render_template(node, template);
    }
    node.name = name;
    Ok(())
}

fn apply_flag(node: &mut ProxyNode, flag: &FlagOptions) {
    if !flag.enabled.unwrap_or(true) {
        return;
    }
    let Some(flag_text) = country_flag(&node.name).or_else(|| country_flag(&node.server)) else {
        return;
    };
    let separator = flag.separator.as_deref().unwrap_or(" ");
    if node.name.contains(flag_text) {
        return;
    }
    node.name = if flag.position.as_deref() == Some("suffix") {
        format!("{}{}{}", node.name, separator, flag_text)
    } else {
        format!("{}{}{}", flag_text, separator, node.name)
    };
}

fn apply_tag(node: &mut ProxyNode, tag: &TagOptions) {
    let mut tags = Vec::new();
    if tag.protocol.unwrap_or(false) {
        tags.push(protocol_tag(node).to_string());
    }
    if tag.network.unwrap_or(false) {
        if let Some(network) = &node.network {
            tags.push(network.to_ascii_uppercase());
        }
    }
    if tag.tls.unwrap_or(false) && node.tls.unwrap_or(false) {
        tags.push("TLS".to_string());
    }
    if tags.is_empty() {
        return;
    }
    let separator = tag.separator.as_deref().unwrap_or(" ");
    let tag_text = tags
        .into_iter()
        .map(|tag| format!("[{}]", tag))
        .collect::<Vec<_>>()
        .join(separator);
    node.name = if tag.position.as_deref() == Some("suffix") {
        format!("{}{}{}", node.name, separator, tag_text)
    } else {
        format!("{}{}{}", tag_text, separator, node.name)
    };
}

fn compare_nodes(a: &ProxyNode, b: &ProxyNode, by: &str) -> Ordering {
    match by {
        "server" => a.server.cmp(&b.server).then_with(|| a.name.cmp(&b.name)),
        "port" => a.port.cmp(&b.port).then_with(|| a.name.cmp(&b.name)),
        "protocol" => format!("{:?}", a.protocol)
            .cmp(&format!("{:?}", b.protocol))
            .then_with(|| a.name.cmp(&b.name)),
        "network" => a.network.cmp(&b.network).then_with(|| a.name.cmp(&b.name)),
        "tls" => a.tls.cmp(&b.tls).then_with(|| a.name.cmp(&b.name)),
        _ => a.name.cmp(&b.name),
    }
}

fn matches_text(value: &str, needle: &str, case_sensitive: Option<bool>) -> bool {
    if case_sensitive.unwrap_or(false) {
        value.contains(needle)
    } else {
        value.to_lowercase().contains(&needle.to_lowercase())
    }
}

fn node_search_text(node: &ProxyNode) -> String {
    format!(
        "{} {} {} {} {:?}",
        node.name, node.server, node.port, node.source, node.protocol
    )
}

fn node_key(node: &ProxyNode, by: &str) -> String {
    match by {
        "name" => node.name.clone(),
        "server" => format!("{}:{}", node.server, node.port),
        "credential" | "secret" => format!(
            "{:?}|{}|{}",
            node.protocol,
            node.uuid.as_deref().unwrap_or(""),
            node.password.as_deref().unwrap_or("")
        ),
        _ => format!(
            "{:?}|{}|{}|{}|{}",
            node.protocol,
            node.server,
            node.port,
            node.uuid.as_deref().unwrap_or(""),
            node.password.as_deref().unwrap_or("")
        ),
    }
}

fn render_template(node: &ProxyNode, template: &str) -> String {
    template
        .replace("{name}", &node.name)
        .replace("{server}", &node.server)
        .replace("{port}", &node.port.to_string())
        .replace("{protocol}", protocol_tag(node))
        .replace("{network}", node.network.as_deref().unwrap_or(""))
        .replace(
            "{flag}",
            country_flag(&node.name)
                .or_else(|| country_flag(&node.server))
                .unwrap_or(""),
        )
}

fn protocol_tag(node: &ProxyNode) -> &'static str {
    match node.protocol {
        super::model::ProxyProtocol::Shadowsocks => "SS",
        super::model::ProxyProtocol::ShadowsocksR => "SSR",
        super::model::ProxyProtocol::Vmess => "VMess",
        super::model::ProxyProtocol::Vless => "VLESS",
        super::model::ProxyProtocol::Trojan => "Trojan",
        super::model::ProxyProtocol::Hysteria => "Hysteria",
        super::model::ProxyProtocol::Hysteria2 => "Hysteria2",
        super::model::ProxyProtocol::Http => "HTTP",
        super::model::ProxyProtocol::Socks5 => "SOCKS5",
        super::model::ProxyProtocol::Snell => "Snell",
        super::model::ProxyProtocol::Tuic => "TUIC",
        super::model::ProxyProtocol::AnyTls => "AnyTLS",
        super::model::ProxyProtocol::WireGuard => "WireGuard",
        super::model::ProxyProtocol::Ssh => "SSH",
    }
}

fn country_flag(input: &str) -> Option<&'static str> {
    let upper = input.to_ascii_uppercase();
    for (needle, flag) in [
        ("HK", "🇭🇰"),
        ("HONG KONG", "🇭🇰"),
        ("香港", "🇭🇰"),
        ("TW", "🇹🇼"),
        ("TAIWAN", "🇹🇼"),
        ("台湾", "🇹🇼"),
        ("JP", "🇯🇵"),
        ("JAPAN", "🇯🇵"),
        ("日本", "🇯🇵"),
        ("SG", "🇸🇬"),
        ("SINGAPORE", "🇸🇬"),
        ("新加坡", "🇸🇬"),
        ("US", "🇺🇸"),
        ("USA", "🇺🇸"),
        ("UNITED STATES", "🇺🇸"),
        ("美国", "🇺🇸"),
        ("KR", "🇰🇷"),
        ("KOREA", "🇰🇷"),
        ("韩国", "🇰🇷"),
        ("UK", "🇬🇧"),
        ("GB", "🇬🇧"),
        ("UNITED KINGDOM", "🇬🇧"),
        ("英国", "🇬🇧"),
        ("DE", "🇩🇪"),
        ("GERMANY", "🇩🇪"),
        ("德国", "🇩🇪"),
        ("FR", "🇫🇷"),
        ("FRANCE", "🇫🇷"),
        ("法国", "🇫🇷"),
        ("CA", "🇨🇦"),
        ("CANADA", "🇨🇦"),
        ("加拿大", "🇨🇦"),
        ("AU", "🇦🇺"),
        ("AUSTRALIA", "🇦🇺"),
        ("澳大利亚", "🇦🇺"),
    ] {
        if upper.contains(needle) {
            return Some(flag);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::model::{
        FilterOptions, FlagOptions, RenameOptions, SortOptions, TagOptions,
    };

    #[test]
    fn filters_renames_sorts_dedupes_and_limits() {
        let input = [
            "ss://aes-128-gcm:secret@b.example.com:8388#B-HK",
            "ss://aes-128-gcm:secret@b.example.com:8388#B-HK-DUP",
            "trojan://pass@a.example.com:443#A-SG",
        ]
        .join("\n");

        let processed = process_subscription(
            &input,
            &ProcessorOptions {
                dedupe: Some(true),
                filter: Some(FilterOptions {
                    exclude: Some("SG".to_string()),
                    ..FilterOptions::default()
                }),
                rename: Some(RenameOptions {
                    prefix: Some("[CF] ".to_string()),
                    replace: Some("B-".to_string()),
                    with: Some(String::new()),
                    ..RenameOptions::default()
                }),
                sort: Some(SortOptions {
                    by: Some("server".to_string()),
                    desc: Some(false),
                }),
                limit: Some(1),
                ..ProcessorOptions::default()
            },
        );

        assert_eq!(processed.nodes.len(), 1);
        assert_eq!(processed.nodes[0].name, "[CF] HK");
        assert_eq!(processed.stats.deduped, 1);
    }

    #[test]
    fn flags_tags_templates_and_dedupe_modes() {
        let input = [
            "vless://00000000-0000-0000-0000-000000000000@sg.example.com:443?type=grpc&security=tls#SG-1",
            "vless://00000000-0000-0000-0000-000000000000@sg.example.com:443?type=grpc&security=tls#SG-duplicate",
            "trojan://pass@hk.example.com:443?security=tls#HK-1",
        ]
        .join("\n");

        let processed = process_subscription(
            &input,
            &ProcessorOptions {
                dedupe: Some(true),
                dedupe_by: Some("server".to_string()),
                filter: Some(FilterOptions {
                    tls: Some(true),
                    ..FilterOptions::default()
                }),
                rename: Some(RenameOptions {
                    template: Some("{flag} {protocol} {name}".to_string()),
                    ..RenameOptions::default()
                }),
                tag: Some(TagOptions {
                    network: Some(true),
                    tls: Some(true),
                    position: Some("suffix".to_string()),
                    ..TagOptions::default()
                }),
                flag: Some(FlagOptions {
                    enabled: Some(true),
                    ..FlagOptions::default()
                }),
                reverse: Some(true),
                ..ProcessorOptions::default()
            },
        );

        assert_eq!(processed.nodes.len(), 2);
        assert!(processed.nodes.iter().any(|node| node.name.contains("🇸🇬")));
        assert!(processed
            .nodes
            .iter()
            .any(|node| node.name.contains("[GRPC]")));
        assert!(processed
            .nodes
            .iter()
            .any(|node| node.name.contains("[TLS]")));
        assert_eq!(processed.stats.deduped, 1);
    }
}
