use regex::Regex;
use std::cmp::Ordering;
use std::collections::HashSet;

use super::model::{ParseResponse, ParseStats, ProcessorOptions, ProxyNode};
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
        nodes.retain(|node| seen.insert(node_key(node)));
        deduped += before.saturating_sub(nodes.len());
    }

    if let Some(rename) = &options.rename {
        for node in &mut nodes {
            if let Err(message) = rename_node(node, rename) {
                warnings.push(message);
            }
        }
    }

    if let Some(sort) = &options.sort {
        let by = sort.by.as_deref().unwrap_or("name");
        nodes.sort_by(|a, b| compare_nodes(a, b, by));
        if sort.desc.unwrap_or(false) {
            nodes.reverse();
        }
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
    node.name = name;
    Ok(())
}

fn compare_nodes(a: &ProxyNode, b: &ProxyNode, by: &str) -> Ordering {
    match by {
        "server" => a.server.cmp(&b.server).then_with(|| a.name.cmp(&b.name)),
        "port" => a.port.cmp(&b.port).then_with(|| a.name.cmp(&b.name)),
        "protocol" => format!("{:?}", a.protocol)
            .cmp(&format!("{:?}", b.protocol))
            .then_with(|| a.name.cmp(&b.name)),
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native::model::{FilterOptions, RenameOptions, SortOptions};

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
            },
        );

        assert_eq!(processed.nodes.len(), 1);
        assert_eq!(processed.nodes[0].name, "[CF] HK");
        assert_eq!(processed.stats.deduped, 1);
    }
}
