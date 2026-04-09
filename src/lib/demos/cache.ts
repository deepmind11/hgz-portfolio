/**
 * KV-backed result cache for demo runs.
 *
 * Demo runs are cached by SHA-256(input). Cache prevents duplicate
 * hits to upstream APIs (ClinVar, gnomAD, OpenRouter) for the same
 * input, which matters for cost and rate limits.
 *
 * Cache key shape: `demo:<project>:<input-hash>`
 * TTL: 24 hours (fresh enough for bioinformatics lookups)
 */

import type { DemoProject, DemoResponse } from "./schema";

const CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours

export async function hashInput(input: unknown): Promise<string> {
	const json = JSON.stringify(input);
	const data = new TextEncoder().encode(`hgz-portfolio-demo:${json}`);
	const hash = await crypto.subtle.digest("SHA-256", data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")
		.slice(0, 32);
}

export async function cacheGet<T>(
	kv: KVNamespace,
	project: DemoProject,
	inputHash: string,
): Promise<DemoResponse<T> | null> {
	const key = `demo:${project}:${inputHash}`;
	const cached = await kv.get(key, { type: "json" });
	if (!cached) return null;
	const response = cached as DemoResponse<T>;
	// Mark as cached for the client
	return { ...response, metadata: { ...response.metadata, cached: true } };
}

export async function cachePut<T>(
	kv: KVNamespace,
	project: DemoProject,
	inputHash: string,
	response: DemoResponse<T>,
): Promise<void> {
	const key = `demo:${project}:${inputHash}`;
	await kv.put(key, JSON.stringify(response), { expirationTtl: CACHE_TTL_SECONDS });
}
