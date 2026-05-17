const API_BASE = import.meta.env.PUBLIC_API_URL || "";

export async function apiFetch<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const url = `${API_BASE}${path}`;
	const response = await fetch(url, {
		...options,
		headers: {
			"Content-Type": "application/json",
			...options.headers,
		},
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "Unknown error");
		throw new Error(`API error ${response.status}: ${text}`);
	}

	return response.json();
}

export function createApiClient(token: string) {
	const headers = { Authorization: `Bearer ${token}` };

	return {
		// Subscriptions
		getSubs: () => apiFetch<{ ok: boolean; items: any[] }>("/api/subs", { headers }),
		getSub: (name: string) => apiFetch<{ ok: boolean; item: any }>(`/api/sub/${name}`, { headers }),
		createSub: (data: any) =>
			apiFetch<{ ok: boolean; item: any }>("/api/subs", {
				method: "POST",
				headers,
				body: JSON.stringify(data),
			}),
		updateSub: (name: string, data: any) =>
			apiFetch<{ ok: boolean; item: any }>(`/api/sub/${name}`, {
				method: "PATCH",
				headers,
				body: JSON.stringify(data),
			}),
		deleteSub: (name: string) =>
			apiFetch<{ ok: boolean }>(`/api/sub/${name}`, { method: "DELETE", headers }),

		// Collections
		getCollections: () => apiFetch<{ ok: boolean; items: any[] }>("/api/collections", { headers }),
		getCollection: (name: string) =>
			apiFetch<{ ok: boolean; item: any }>(`/api/collection/${name}`, { headers }),
		createCollection: (data: any) =>
			apiFetch<{ ok: boolean; item: any }>("/api/collections", {
				method: "POST",
				headers,
				body: JSON.stringify(data),
			}),
		deleteCollection: (name: string) =>
			apiFetch<{ ok: boolean }>(`/api/collection/${name}`, { method: "DELETE", headers }),

		// Files
		getFiles: () => apiFetch<{ ok: boolean; items: any[] }>("/api/files", { headers }),

		// Artifacts
		getArtifacts: () => apiFetch<{ ok: boolean; items: any[] }>("/api/artifacts", { headers }),

		// Parse & Export
		parse: (content: string) =>
			apiFetch<any>("/api/native/parse", {
				method: "POST",
				headers,
				body: JSON.stringify({ content }),
			}),
		exportData: (content: string, target?: string, processors?: any) =>
			apiFetch<any>("/api/native/export", {
				method: "POST",
				headers,
				body: JSON.stringify({ content, target, processors }),
			}),
		process: (content: string, processors: any) =>
			apiFetch<any>("/api/native/process", {
				method: "POST",
				headers,
				body: JSON.stringify({ content, processors }),
			}),
		fetchRemote: (url: string) =>
			apiFetch<any>("/api/native/fetch/parse", {
				method: "POST",
				headers,
				body: JSON.stringify({ url }),
			}),

		// Refresh
		refresh: (data?: any) =>
			apiFetch<any>("/api/refresh", {
				method: "POST",
				headers,
				body: JSON.stringify(data || {}),
			}),
		refreshSub: (name: string) =>
			apiFetch<any>(`/api/sub/${name}/refresh`, { method: "POST", headers }),
		refreshCollection: (name: string) =>
			apiFetch<any>(`/api/collection/${name}/refresh`, { method: "POST", headers }),

		// Backup
		getBackup: () => apiFetch<any>("/api/backup", { headers }),
		restoreBackup: (data: any) =>
			apiFetch<any>("/api/backup/restore", {
				method: "POST",
				headers,
				body: JSON.stringify(data),
			}),

		// Settings & Tokens
		getSettings: () => apiFetch<{ ok: boolean; items: any[] }>("/api/settings", { headers }),
		getTokens: () => apiFetch<{ ok: boolean; items: any[] }>("/api/tokens", { headers }),

		// Status
		getEnv: () => apiFetch<any>("/api/utils/env", { headers }),
		getStatus: () => apiFetch<any>("/api/utils/worker-status", { headers }),
		getCapabilities: () => apiFetch<any>("/api/native/capabilities", { headers }),
	};
}
