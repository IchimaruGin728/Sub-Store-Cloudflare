const TOKEN_COOKIE = "sub-store-token";

export function getTokenFromCookie(cookieHeader: string | null): string | null {
	if (!cookieHeader) return null;
	const match = cookieHeader.match(new RegExp(`${TOKEN_COOKIE}=([^;]+)`));
	return match ? match[1] : null;
}

export function setTokenCookie(token: string): string {
	return `${TOKEN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}`;
}

export function clearTokenCookie(): string {
	return `${TOKEN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}
