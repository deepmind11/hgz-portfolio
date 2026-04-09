/**
 * Per-project rate limits for live demos.
 *
 * Each project gets its own bucket keyed by `demo:<project>:<ip-hash>`
 * so abuse of one demo can't exhaust the quota for another.
 *
 * Uses a simplified KV-backed sliding window (no DB writes; each bucket
 * is one KV key that gets overwritten). Good enough for demo purposes
 * and avoids D1 write amplification.
 */

import type { DemoProject } from "./schema";

export interface DemoLimitConfig {
	windowSeconds: number;
	maxRequests: number;
	dailyMax: number;
}

export const DEMO_LIMITS: Record<DemoProject, DemoLimitConfig> = {
	variantagent: { windowSeconds: 60, maxRequests: 6, dailyMax: 30 },
	"clinic-ops-copilot": { windowSeconds: 60, maxRequests: 6, dailyMax: 30 },
	covalentagent: { windowSeconds: 60, maxRequests: 4, dailyMax: 15 },
	constella: { windowSeconds: 60, maxRequests: 2, dailyMax: 10 },
};

export interface DemoRateResult {
	allowed: boolean;
	remaining: number;
	resetSeconds: number;
	dailyRemaining: number;
	reason?: "burst" | "daily";
}

interface RateBucket {
	windowStart: number;
	burstCount: number;
	dayCount: number;
	dayStart: number;
}

export async function checkDemoRateLimit(
	kv: KVNamespace,
	project: DemoProject,
	ipHash: string,
): Promise<DemoRateResult> {
	const cfg = DEMO_LIMITS[project];
	const key = `ratelimit:demo:${project}:${ipHash}`;
	const now = Math.floor(Date.now() / 1000);

	const stored = (await kv.get(key, { type: "json" })) as RateBucket | null;
	let bucket: RateBucket = stored ?? {
		windowStart: now,
		burstCount: 0,
		dayCount: 0,
		dayStart: now,
	};

	// Reset burst window if expired
	if (bucket.windowStart + cfg.windowSeconds < now) {
		bucket = { ...bucket, windowStart: now, burstCount: 0 };
	}
	// Reset daily window if expired
	if (bucket.dayStart + 86400 < now) {
		bucket = { ...bucket, dayStart: now, dayCount: 0 };
	}

	if (bucket.burstCount >= cfg.maxRequests) {
		return {
			allowed: false,
			remaining: 0,
			resetSeconds: bucket.windowStart + cfg.windowSeconds - now,
			dailyRemaining: Math.max(0, cfg.dailyMax - bucket.dayCount),
			reason: "burst",
		};
	}

	if (bucket.dayCount >= cfg.dailyMax) {
		return {
			allowed: false,
			remaining: cfg.maxRequests - bucket.burstCount,
			resetSeconds: 86400,
			dailyRemaining: 0,
			reason: "daily",
		};
	}

	const next: RateBucket = {
		...bucket,
		burstCount: bucket.burstCount + 1,
		dayCount: bucket.dayCount + 1,
	};
	await kv.put(key, JSON.stringify(next), { expirationTtl: 86400 });

	return {
		allowed: true,
		remaining: cfg.maxRequests - next.burstCount,
		resetSeconds: next.windowStart + cfg.windowSeconds - now,
		dailyRemaining: cfg.dailyMax - next.dayCount,
	};
}

export async function hashIpForDemo(ip: string): Promise<string> {
	const data = new TextEncoder().encode(`hgz-portfolio-demo-rl:${ip}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 16);
}
