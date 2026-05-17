import { useState } from "preact/hooks";

interface Props {
	content: string;
	onExport?: (target: string, result: string) => void;
}

const TARGETS = [
	{ value: "json", label: "JSON" },
	{ value: "uri-list", label: "URI List" },
	{ value: "v2ray", label: "V2Ray (Base64)" },
	{ value: "clash", label: "Clash" },
	{ value: "clash-meta", label: "Clash Meta" },
	{ value: "mihomo", label: "Mihomo" },
	{ value: "stash", label: "Stash" },
	{ value: "sing-box", label: "sing-box" },
	{ value: "surge", label: "Surge" },
	{ value: "surge-mac", label: "Surge Mac" },
	{ value: "loon", label: "Loon" },
	{ value: "quantumult-x", label: "Quantumult X" },
	{ value: "shadowrocket", label: "Shadowrocket" },
	{ value: "surfboard", label: "Surfboard" },
	{ value: "egern", label: "Egern" },
];

export default function ExportPanel({ content, onExport }: Props) {
	const [target, setTarget] = useState("clash");
	const [result, setResult] = useState("");
	const [loading, setLoading] = useState(false);
	const [stats, setStats] = useState<any>(null);

	const handleExport = async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/native/export", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ content, target }),
			});
			const data = await res.json();
			setResult(data.content || "");
			setStats(data.stats);
			onExport?.(target, data.content || "");
		} catch (e) {
			setResult("Export failed: " + e);
		} finally {
			setLoading(false);
		}
	};

	const copyToClipboard = () => {
		navigator.clipboard.writeText(result);
	};

	const downloadResult = () => {
		const ext = target === "sing-box" ? "json" : target === "clash" || target === "clash-meta" || target === "mihomo" ? "yaml" : "txt";
		const blob = new Blob([result], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `export.${ext}`;
		a.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div class="space-y-4">
			<div class="flex gap-2 items-end">
				<div class="flex-1">
					<label class="block text-sm font-medium mb-1">Export Format</label>
					<select
						class="input-field"
						value={target}
						onChange={(e) => setTarget((e.target as HTMLSelectElement).value)}
					>
						{TARGETS.map((t) => (
							<option key={t.value} value={t.value}>
								{t.label}
							</option>
						))}
					</select>
				</div>
				<button
					type="button"
					class="btn-primary"
					onClick={handleExport}
					disabled={loading || !content}
				>
					{loading ? "Exporting..." : "Export"}
				</button>
			</div>

			{stats && (
				<div class="flex gap-4 text-sm text-gray-500">
					<span>Parsed: {stats.parsed}</span>
					<span>Skipped: {stats.skipped}</span>
					<span>Deduped: {stats.deduped}</span>
				</div>
			)}

			{result && (
				<div class="space-y-2">
					<div class="flex gap-2">
						<button type="button" class="btn-ghost text-sm" onClick={copyToClipboard}>
							Copy
						</button>
						<button type="button" class="btn-ghost text-sm" onClick={downloadResult}>
							Download
						</button>
					</div>
					<pre class="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg overflow-auto max-h-96 text-sm font-mono">
						{result}
					</pre>
				</div>
			)}
		</div>
	);
}
