import { getSecret } from "astro:env/server";
import type { APIRoute } from "astro";
import { Hono } from "hono";
import { getTokenFromCookie } from "../../lib/auth";

const app = new Hono().basePath("/api");

const BACKEND_URL =
	getSecret("BACKEND_URL") || "https://sub-store-cloudflare.ichimarugin728.workers.dev";

// Proxy all requests to worker-rs backend
app.all("/*", async (c) => {
	const path = c.req.path;
	const method = c.req.method;

	// Get token from cookie or Authorization header
	const cookieHeader = c.req.header("cookie");
	const cookieToken = getTokenFromCookie(cookieHeader);
	const authHeader = c.req.header("authorization");
	const token = cookieToken || authHeader?.replace("Bearer ", "");

	// Build backend URL
	const url = new URL(c.req.url);
	const backendUrl = `${BACKEND_URL}${path}${url.search}`;

	// Forward request to backend
	const headers = new Headers();
	if (token) {
		headers.set("Authorization", `Bearer ${token}`);
	}

	// Copy relevant headers
	const contentType = c.req.header("content-type");
	if (contentType) headers.set("Content-Type", contentType);

	const accept = c.req.header("accept");
	if (accept) headers.set("Accept", accept);

	try {
		const body = method !== "GET" && method !== "HEAD" ? await c.req.raw.clone().text() : undefined;

		const response = await fetch(backendUrl, {
			method,
			headers,
			body: body || undefined,
		});

		// Forward response
		const responseHeaders = new Headers();
		responseHeaders.set("Content-Type", response.headers.get("Content-Type") || "application/json");

		return new Response(response.body, {
			status: response.status,
			headers: responseHeaders,
		});
	} catch (error) {
		return c.json(
			{ error: "Backend request failed", message: String(error) },
			{ status: 502 },
		);
	}
});

export const ALL: APIRoute = async (context) => {
	return app.fetch(context.request);
};
