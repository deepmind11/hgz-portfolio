/**
 * Sliding-window rate limit backed by D1.
 *
 * Strategy: per-IP-hash bucket. Each user gets:
 *   - 8 requests per 60-second window (burst protection)
 *   - 30 requests per 24-hour window (cost protection)
 *
 * The IP is hashed (SHA-256) so we never store raw IPs.
 */

export interface RateLimitConfig {
	windowSeconds: number;
	maxRequests: number;
	dailyMax: number;
}

export const DEFAULT_LIMITS: RateLimitConfig = {
	windowSeconds: 60,
	maxRequests: 8,
	dailyMax: 30,
};

export interface RateLimitResult {
	allowed: boolean;
	remaining: number;
	resetSeconds: number;
	dailyRemaining: number;
	reason?: "burst" | "daily";
}

export async function hashIp(ip: string): Promise<string> {
	const data = new TextEncoder().encode(`hgz-portfolio-salt:${ip}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
}

export async function checkRateLimit(
	db: D1Database,
	ipHash: string,
	cfg: RateLimitConfig = DEFAULT_LIMITS,
): Promise<RateLimitResult> {
	const now = Math.floor(Date.now() / 1000);
	const windowStart = now - cfg.windowSeconds;
	const dayStart = now - 86400;

	const row = await db
		.prepare(
			"SELECT window_start, request_count, total_count FROM rate_limits WHERE ip_hash = ?",
		)
		.bind(ipHash)
		.first<{ window_start: number; request_count: number; total_count: number }>();

	if (!row) {
		await db
			.prepare(
				"INSERT INTO rate_limits (ip_hash, window_start, request_count, total_count) VALUES (?, ?, 1, 1)",
			)
			.bind(ipHash, now)
			.run();
		return {
			allowed: true,
			remaining: cfg.maxRequests - 1,
			resetSeconds: cfg.windowSeconds,
			dailyRemaining: cfg.dailyMax - 1,
		};
	}

	// Reset burst window if expired
	let burstStart = row.window_start;
	let burstCount = row.request_count;
	if (burstStart < windowStart) {
		burstStart = now;
		burstCount = 0;
	}

	// Reset daily counter if last request was >24h ago
	let dailyCount = row.total_count;
	if (row.window_start < dayStart) {
		dailyCount = 0;
	}

	if (burstCount >= cfg.maxRequests) {
		return {
			allowed: false,
			remaining: 0,
			resetSeconds: burstStart + cfg.windowSeconds - now,
			dailyRemaining: Math.max(0, cfg.dailyMax - dailyCount),
			reason: "burst",
		};
	}

	if (dailyCount >= cfg.dailyMax) {
		return {
			allowed: false,
			remaining: cfg.maxRequests - burstCount,
			resetSeconds: 86400,
			dailyRemaining: 0,
			reason: "daily",
		};
	}

	const newBurst = burstCount + 1;
	const newDaily = dailyCount + 1;
	await db
		.prepare(
			"UPDATE rate_limits SET window_start = ?, request_count = ?, total_count = ? WHERE ip_hash = ?",
		)
		.bind(burstStart, newBurst, newDaily, ipHash)
		.run();

	return {
		allowed: true,
		remaining: cfg.maxRequests - newBurst,
		resetSeconds: burstStart + cfg.windowSeconds - now,
		dailyRemaining: cfg.dailyMax - newDaily,
	};
}
