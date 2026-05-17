import { useState, useEffect } from "preact/hooks";

interface RefreshResult {
	ok: boolean;
	kind: string;
	name: string;
	target?: string;
	artifact?: string;
	error?: string;
}

interface RefreshResponse {
	ok: boolean;
	refreshed: number;
	failed: number;
	results: RefreshResult[];
	refreshed_at: string;
}

export default function RefreshStatus() {
	const [status, setStatus] = useState<RefreshResponse | null>(null);
	const [loading, setLoading] = useState(false);

	const doRefresh = async () => {
		setLoading(true);
		try {
			const res = await fetch("/api/refresh", { method: "POST", body: "{}" });
			const data = await res.json();
			setStatus(data);
		} catch (e) {
			setStatus({
				ok: false,
				refreshed: 0,
				failed: 0,
				results: [],
				refreshed_at: "",
			});
		} finally {
			setLoading(false);
		}
	};

	return (
		<div class="space-y-4">
			<div class="flex items-center gap-3">
				<button
					type="button"
					class="btn-primary flex items-center gap-2"
					onClick={doRefresh}
					disabled={loading}
				>
					<span class="i-heroicons-arrow-path" />
					{loading ? "Refreshing..." : "Refresh All"}
				</button>
				{status && (
					<span class="text-sm text-gray-500">
						{status.refreshed} ok, {status.failed} failed
					</span>
				)}
			</div>

			{status && status.results.length > 0 && (
				<div class="space-y-2">
					{status.results.map((r, i) => (
						<div
							key={i}
							class="flex items-center gap-3 text-sm"
						>
							{r.ok ? (
								<span class="i-heroicons-check-circle text-green-500" />
							) : (
								<span class="i-heroicons-exclamation-triangle text-red-500" />
							)}
							<span class="font-medium">{r.name}</span>
							<span class="text-gray-400">{r.kind}</span>
							{r.target && <span class="text-gray-400">→ {r.target}</span>}
							{r.error && <span class="text-red-500 text-xs">{r.error}</span>}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
