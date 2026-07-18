use js_sys::Math;
use regex::Regex;
use std::cmp::Ordering;
use std::collections::HashSet;

use super::model::{
    DeleteOptions, DuplicateOptions, FlagOptions, ParseResponse, ParseStats, ProcessorOptions,
    ProxyNode, RegexRenameOptions, RegexSortOptions, RegionFilterOptions, SetOptions, TagOptions,
    TypeFilterOptions,
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

    if options.useless.unwrap_or(false) {
        nodes.retain(is_useful_node);
    }

    if let Some(region_filter) = &options.region_filter {
        nodes.retain(|node| filter_region(node, region_filter));
    }

    if let Some(type_filter) = &options.type_filter {
        nodes.retain(|node| filter_type(node, type_filter));
    }

    if let Some(filter) = &options.filter {
        nodes.retain(|node| filter_node(node, filter));
    }

    if let Some(regex_filter) = &options.regex_filter {
        if let Err(message) = apply_regex_filter(&mut nodes, regex_filter) {
            warnings.push(message);
        }
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

    if let Some(regex_rename) = &options.regex_rename {
        for node in &mut nodes {
            if let Err(message) = apply_regex_rename(node, regex_rename) {
                warnings.push(message);
            }
        }
    }

    if let Some(delete) = &options.delete {
        let before = nodes.len();
        if let Err(message) = apply_delete(&mut nodes, delete) {
            warnings.push(message);
        }
        deduped += before.saturating_sub(nodes.len());
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

    if let Some(set) = &options.set {
        for node in &mut nodes {
            apply_set(node, set);
        }
    }

    if let Some(sort) = &options.sort {
        if is_random_order(sort.order.as_deref()) || sort.by.as_deref() == Some("random") {
            for index in (1..nodes.len()).rev() {
                let swap_index = (Math::random() * ((index + 1) as f64)).floor() as usize;
                nodes.swap(index, swap_index);
            }
        } else {
            let by = sort.by.as_deref().unwrap_or("name");
            nodes.sort_by(|a, b| compare_nodes(a, b, by));
        }
        if sort.desc.unwrap_or(false) || matches!(sort.order.as_deref(), Some("desc")) {
            nodes.reverse();
        }
    }

    if let Some(regex_sort) = &options.regex_sort {
        if let Err(message) = apply_regex_sort(&mut nodes, regex_sort) {
            warnings.push(message);
        }
    }

    if let Some(duplicate) = &options.duplicate {
        let before = nodes.len();
        apply_duplicate(&mut nodes, duplicate);
        deduped += before.saturating_sub(nodes.len());
    }

    if options.reverse.unwrap_or(false) {
        nodes.reverse();
    }

    if let Some(limit) = options.limit {
        nodes.truncate(limit);
    }

    (nodes, warnings, deduped)
}

fn is_useful_node(node: &ProxyNode) -> bool {
    if has_non_ascii(node.cipher.as_deref().unwrap_or(""))
        || has_non_ascii(node.password.as_deref().unwrap_or(""))
    {
        return false;
    }
    if Regex::new("网址|流量|时间|应急|过期|Bandwidth|expire")
        .map(|regex| regex.is_match(&node.name))
        .unwrap_or(false)
    {
        return false;
    }
    true
}

fn has_non_ascii(value: &str) -> bool {
    !value.is_ascii()
}

fn filter_region(node: &ProxyNode, filter: &RegionFilterOptions) -> bool {
    let regions = filter
        .regions
        .as_deref()
        .or(filter.value.as_deref())
        .unwrap_or(&[]);
    let selected = regions.iter().any(|region| {
        region_flag(region).is_some_and(|flag| {
            node.name.contains(flag) || country_flag(&node.server) == Some(flag)
        })
    });
    if filter.keep.unwrap_or(true) {
        selected
    } else {
        !selected
    }
}

fn filter_type(node: &ProxyNode, filter: &TypeFilterOptions) -> bool {
    let types = filter
        .types
        .as_deref()
        .or(filter.value.as_deref())
        .unwrap_or(&[]);
    let protocol = protocol_tag(node);
    let selected = types.iter().any(|kind| {
        let kind = kind.to_ascii_lowercase();
        kind == protocol.to_ascii_lowercase()
            || kind == format!("{:?}", node.protocol).to_ascii_lowercase()
            || (kind == "http(s)" && matches!(protocol, "HTTP"))
    });
    if filter.keep.unwrap_or(true) {
        selected
    } else {
        !selected
    }
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

fn apply_regex_filter(
    nodes: &mut Vec<ProxyNode>,
    filter: &super::model::RegexFilterOptions,
) -> Result<(), String> {
    let patterns = filter
        .regex
        .as_deref()
        .or(filter.expressions.as_deref())
        .unwrap_or(&[]);
    if patterns.is_empty() {
        return Ok(());
    }
    let regexes = patterns
        .iter()
        .map(|pattern| {
            Regex::new(pattern)
                .map_err(|err| format!("invalid regex filter pattern `{}`: {}", pattern, err))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let keep = filter.keep.unwrap_or(true);
    nodes.retain(|node| {
        let selected = regexes.iter().any(|regex| regex.is_match(&node.name));
        if keep {
            selected
        } else {
            !selected
        }
    });
    Ok(())
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

fn apply_regex_rename(node: &mut ProxyNode, rename: &RegexRenameOptions) -> Result<(), String> {
    for rule in rename.rules.as_deref().unwrap_or(&[]) {
        let regex = Regex::new(&rule.expr)
            .map_err(|err| format!("invalid regex rename pattern `{}`: {}", rule.expr, err))?;
        node.name = regex
            .replace_all(&node.name, rule.now.as_deref().unwrap_or(""))
            .trim()
            .to_string();
    }
    Ok(())
}

fn apply_delete(nodes: &mut Vec<ProxyNode>, delete: &DeleteOptions) -> Result<(), String> {
    let patterns = delete
        .patterns
        .as_deref()
        .unwrap_or(&[])
        .iter()
        .map(|pattern| {
            if delete.trim.unwrap_or(true) {
                pattern.trim().to_string()
            } else {
                pattern.clone()
            }
        })
        .filter(|pattern| !pattern.is_empty())
        .collect::<Vec<_>>();
    if patterns.is_empty() {
        return Ok(());
    }
    if delete.regex.unwrap_or(true) {
        let regexes = patterns
            .iter()
            .map(|pattern| {
                Regex::new(pattern)
                    .map_err(|err| format!("invalid delete regex `{}`: {}", pattern, err))
            })
            .collect::<Result<Vec<_>, _>>()?;
        nodes.retain(|node| !regexes.iter().any(|regex| regex.is_match(&node.name)));
    } else {
        nodes.retain(|node| !patterns.iter().any(|pattern| node.name.contains(pattern)));
    }
    Ok(())
}

fn apply_flag(node: &mut ProxyNode, flag: &FlagOptions) {
    if flag.mode.as_deref() == Some("remove") {
        node.name = remove_flags(&node.name).trim().to_string();
        return;
    }
    if !flag.enabled.unwrap_or(true) {
        return;
    }
    let Some(flag_text) = country_flag(&node.name).or_else(|| country_flag(&node.server)) else {
        return;
    };
    let flag_text = match (flag_text, flag.tw.as_deref()) {
        ("🇹🇼", Some("ws")) => "🇼🇸",
        ("🇹🇼", Some("tw")) => "🇹🇼",
        ("🇹🇼", _) => "🇨🇳",
        _ => flag_text,
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

fn remove_flags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        let code = ch as u32;
        if !(0x1F1E6..=0x1F1FF).contains(&code) {
            out.push(ch);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
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

fn apply_set(node: &mut ProxyNode, set: &SetOptions) {
    set_bool_param(node, "udp", set.udp);
    set_bool_param(node, "tfo", set.tfo);
    set_bool_param(node, "fast-open", set.fast_open.or(set.tfo));
    set_bool_param(node, "skip-cert-verify", set.skip_cert_verify);
    if matches!(node.protocol, super::model::ProxyProtocol::Vmess) {
        set_bool_param(node, "aead", set.vmess_aead);
    }
    if let Some(tls) = set.tls {
        node.tls = Some(tls);
        if tls {
            node.params
                .insert("security".to_string(), "tls".to_string());
        } else {
            node.params.remove("security");
        }
    }
    if let Some(network) = &set.network {
        node.network = Some(network.clone());
    }
    if let Some(server) = &set.server {
        node.server = server.clone();
    }
    if let Some(port) = set.port {
        node.port = port;
    }
}

fn apply_regex_sort(nodes: &mut [ProxyNode], options: &RegexSortOptions) -> Result<(), String> {
    let patterns = options.expressions.as_deref().unwrap_or(&[]);
    if patterns.is_empty() {
        return Ok(());
    }
    let regexes = patterns
        .iter()
        .map(|pattern| {
            Regex::new(pattern)
                .map_err(|err| format!("invalid regex sort pattern `{}`: {}", pattern, err))
        })
        .collect::<Result<Vec<_>, _>>()?;
    let order = options.order.as_deref().unwrap_or("asc");
    nodes.sort_by(|a, b| compare_regex_rank(&regexes, &a.name, &b.name, order));
    Ok(())
}

fn apply_duplicate(nodes: &mut Vec<ProxyNode>, options: &DuplicateOptions) {
    let fields = options.field.as_deref().unwrap_or(&[]);
    let fields = if fields.is_empty() {
        vec!["name".to_string()]
    } else {
        fields.to_vec()
    };
    if options.action.as_deref() == Some("delete") {
        let mut seen = HashSet::new();
        nodes.retain(|node| seen.insert(duplicate_key(node, &fields)));
        return;
    }

    let template = options.template.as_deref().unwrap_or("0 1 2 3 4 5 6 7 8 9");
    let numbers = template.split_whitespace().collect::<Vec<_>>();
    let numbers = if numbers.len() == 10 {
        numbers
    } else {
        vec!["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
    };
    let link = options.link.as_deref().unwrap_or("-");
    let position = options.position.as_deref().unwrap_or("back");

    let keys = nodes
        .iter()
        .map(|node| duplicate_key(node, &fields))
        .collect::<Vec<_>>();
    let mut totals = std::collections::HashMap::<String, usize>::new();
    for key in &keys {
        *totals.entry(key.clone()).or_default() += 1;
    }
    let max_len = totals
        .values()
        .map(|count| count.to_string().len())
        .max()
        .unwrap_or(1);
    let mut increments = std::collections::HashMap::<String, usize>::new();
    for (node, key) in nodes.iter_mut().zip(keys) {
        if totals.get(&key).copied().unwrap_or(0) <= 1 {
            continue;
        }
        let count = increments.entry(key).or_insert(1);
        let mut rendered = render_duplicate_number(*count, &numbers);
        *count += 1;
        while rendered.chars().count() < max_len {
            rendered = format!("{}{}", numbers[0], rendered);
        }
        node.name = if position == "front" {
            format!("{}{}{}", rendered, link, node.name)
        } else {
            format!("{}{}{}", node.name, link, rendered)
        };
    }
}

fn render_duplicate_number(mut value: usize, numbers: &[&str]) -> String {
    if value == 0 {
        return numbers[0].to_string();
    }
    let mut parts = Vec::new();
    while value > 0 {
        parts.push(numbers[value % 10]);
        value /= 10;
    }
    parts.into_iter().rev().collect::<Vec<_>>().join("")
}

fn duplicate_key(node: &ProxyNode, fields: &[String]) -> String {
    fields
        .iter()
        .map(|field| node_field(node, field))
        .collect::<Vec<_>>()
        .join("_")
}

fn node_field(node: &ProxyNode, field: &str) -> String {
    match field {
        "name" => node.name.clone(),
        "server" => node.server.clone(),
        "port" => node.port.to_string(),
        "type" | "protocol" => protocol_tag(node).to_string(),
        "network" => node.network.clone().unwrap_or_else(|| "-".to_string()),
        "uuid" => node.uuid.clone().unwrap_or_else(|| "-".to_string()),
        "password" => node.password.clone().unwrap_or_else(|| "-".to_string()),
        "username" => node.username.clone().unwrap_or_else(|| "-".to_string()),
        "cipher" => node.cipher.clone().unwrap_or_else(|| "-".to_string()),
        field if field.starts_with("params.") => node
            .params
            .get(&field[7..])
            .cloned()
            .unwrap_or_else(|| "-".to_string()),
        field => node
            .params
            .get(field)
            .cloned()
            .unwrap_or_else(|| "-".to_string()),
    }
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

fn compare_regex_rank(regexes: &[Regex], a: &str, b: &str, order: &str) -> Ordering {
    let rank_a = regex_rank(regexes, a);
    let rank_b = regex_rank(regexes, b);
    match (rank_a, rank_b) {
        (Some(a_rank), Some(b_rank)) => a_rank
            .cmp(&b_rank)
            .then_with(|| fallback_name_order(a, b, order)),
        (Some(_), None) => Ordering::Less,
        (None, Some(_)) => Ordering::Greater,
        (None, None) => fallback_name_order(a, b, order),
    }
}

fn regex_rank(regexes: &[Regex], input: &str) -> Option<usize> {
    regexes.iter().position(|regex| regex.is_match(input))
}

fn fallback_name_order(a: &str, b: &str, order: &str) -> Ordering {
    match order {
        "desc" => b.cmp(a),
        "original" => Ordering::Equal,
        _ => a.cmp(b),
    }
}

fn is_random_order(order: Option<&str>) -> bool {
    matches!(order, Some("random"))
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

fn set_bool_param(node: &mut ProxyNode, key: &str, value: Option<bool>) {
    match value {
        Some(true) => {
            node.params.insert(key.to_string(), "true".to_string());
        }
        Some(false) => {
            node.params.remove(key);
        }
        None => {}
    }
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

fn region_flag(region: &str) -> Option<&'static str> {
    match region.to_ascii_uppercase().as_str() {
        "HK" => Some("🇭🇰"),
        "TW" => Some("🇹🇼"),
        "US" => Some("🇺🇸"),
        "SG" => Some("🇸🇬"),
        "JP" => Some("🇯🇵"),
        "UK" | "GB" => Some("🇬🇧"),
        "DE" => Some("🇩🇪"),
        "KR" => Some("🇰🇷"),
        "CN" => Some("🇨🇳"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::model::{
        DeleteOptions, DuplicateOptions, FilterOptions, FlagOptions, RegexFilterOptions,
        RegexRenameOptions, RegexRenameRule, RegexSortOptions, RenameOptions, SetOptions,
        SortOptions, TagOptions,
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
                    ..SortOptions::default()
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

    #[test]
    fn applies_set_delete_and_regex_sort_processors() {
        let input = [
            "vless://00000000-0000-0000-0000-000000000000@b.example.com:443?type=ws&security=tls#B-Node",
            "vless://00000000-0000-0000-0000-000000000000@a.example.com:80#A-Remove",
            "trojan://pass@c.example.com:443#C-Node",
        ]
        .join("\n");

        let processed = process_subscription(
            &input,
            &ProcessorOptions {
                delete: Some(DeleteOptions {
                    patterns: Some(vec!["Remove".to_string()]),
                    ..DeleteOptions::default()
                }),
                set: Some(SetOptions {
                    udp: Some(true),
                    skip_cert_verify: Some(true),
                    ..SetOptions::default()
                }),
                regex_sort: Some(RegexSortOptions {
                    expressions: Some(vec!["C-".to_string(), "B-".to_string()]),
                    order: Some("asc".to_string()),
                }),
                ..ProcessorOptions::default()
            },
        );

        assert_eq!(processed.nodes.len(), 2);
        assert_eq!(processed.nodes[0].name, "C-Node");
        assert_eq!(processed.nodes[1].name, "B-Node");
        assert_eq!(
            processed.nodes[1]
                .params
                .get("skip-cert-verify")
                .map(String::as_str),
            Some("true")
        );
        assert_eq!(
            processed.nodes[1].params.get("udp").map(String::as_str),
            Some("true")
        );
    }

    #[test]
    fn applies_upstream_style_regex_and_duplicate_processors() {
        let input = [
            "ss://aes-128-gcm:secret@a.example.com:8388#🇭🇰 HK 01",
            "ss://aes-128-gcm:secret@b.example.com:8388#🇭🇰 HK 01",
            "ss://aes-128-gcm:secret@c.example.com:8388#🇸🇬 SG 01",
        ]
        .join("\n");

        let processed = process_subscription(
            &input,
            &ProcessorOptions {
                regex_filter: Some(RegexFilterOptions {
                    regex: Some(vec!["HK|SG".to_string()]),
                    keep: Some(true),
                    ..RegexFilterOptions::default()
                }),
                regex_rename: Some(RegexRenameOptions {
                    rules: Some(vec![RegexRenameRule {
                        expr: r"\s+\d+$".to_string(),
                        now: Some(String::new()),
                    }]),
                }),
                flag: Some(FlagOptions {
                    mode: Some("remove".to_string()),
                    ..FlagOptions::default()
                }),
                duplicate: Some(DuplicateOptions {
                    action: Some("rename".to_string()),
                    field: Some(vec!["name".to_string()]),
                    ..DuplicateOptions::default()
                }),
                ..ProcessorOptions::default()
            },
        );

        assert_eq!(processed.nodes.len(), 3);
        assert!(processed.nodes.iter().any(|node| node.name == "HK-1"));
        assert!(processed.nodes.iter().any(|node| node.name == "HK-2"));
        assert!(processed.nodes.iter().any(|node| node.name == "SG"));
    }
}
