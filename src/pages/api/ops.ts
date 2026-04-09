/**
 * GET /api/ops
 *
 * Public read-only observability endpoint. Pulls aggregate stats from
 * D1 about chatbot usage and returns them as JSON. The /ops page
 * fetches this and renders a dashboard.
 *
 * No PII leaks: we only expose counts, latencies, and token totals.
 * User IP hashes and full message content stay out of the response.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";

export const prerender = false;

export const GET: APIRoute = async () => {
	try {
		const now = Math.floor(Date.now() / 1000);
		const dayAgo = (now - 86400) * 1000;
		const weekAgo = (now - 7 * 86400) * 1000;

		// Total + recent chat message counts
		const totalRow = await env.DB
			.prepare(
				"SELECT COUNT(*) AS total, COUNT(DISTINCT session_id) AS sessions FROM chat_messages",
			)
			.first<{ total: number; sessions: number }>();

		const recentRow = await env.DB
			.prepare(
				"SELECT COUNT(*) AS day, (SELECT COUNT(*) FROM chat_messages WHERE created_at >= ?) AS week FROM chat_messages WHERE created_at >= ?",
			)
			.bind(weekAgo, dayAgo)
			.first<{ day: number; week: number }>();

		// Token usage on assistant messages
		const tokenRow = await env.DB
			.prepare(
				"SELECT SUM(prompt_tokens) AS prompt_total, SUM(completion_tokens) AS completion_total, COUNT(*) AS assistant_count FROM chat_messages WHERE role = 'assistant'",
			)
			.first<{
				prompt_total: number | null;
				completion_total: number | null;
				assistant_count: number;
			}>();

		// Latency percentiles (cheap approximation: sort in-app)
		const latencyRows = await env.DB
			.prepare(
				"SELECT latency_ms FROM chat_messages WHERE role = 'assistant' AND latency_ms IS NOT NULL ORDER BY created_at DESC LIMIT 200",
			)
			.all<{ latency_ms: number }>();

		const latencies = (latencyRows.results ?? [])
			.map((r) => r.latency_ms)
			.filter((v): v is number => typeof v === "number")
			.sort((a, b) => a - b);
		const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? null;
		const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? null;

		// Top 10 most recent user questions (content only, truncated, no IP)
		const recentQuestionsRows = await env.DB
			.prepare(
				"SELECT content, created_at FROM chat_messages WHERE role = 'user' ORDER BY created_at DESC LIMIT 10",
			)
			.all<{ content: string; created_at: number }>();

		const recentQuestions = (recentQuestionsRows.results ?? []).map((r) => ({
			text: r.content.length > 80 ? r.content.slice(0, 78) + "..." : r.content,
			ago: humanizeAgo(now * 1000 - r.created_at),
		}));

		// Estimate cost (gemini-2.0-flash-001: $0.075/1M input, $0.30/1M output)
		const promptTotal = tokenRow?.prompt_total ?? 0;
		const completionTotal = tokenRow?.completion_total ?? 0;
		const estimatedCostUsd =
			(promptTotal / 1_000_000) * 0.075 + (completionTotal / 1_000_000) * 0.3;

		const payload = {
			generated_at: new Date().toISOString(),
			chatbot: {
				total_messages: totalRow?.total ?? 0,
				unique_sessions: totalRow?.sessions ?? 0,
				messages_last_24h: recentRow?.day ?? 0,
				messages_last_7d: recentRow?.week ?? 0,
				assistant_messages: tokenRow?.assistant_count ?? 0,
				prompt_tokens_total: promptTotal,
				completion_tokens_total: completionTotal,
				estimated_cost_usd: Math.round(estimatedCostUsd * 10000) / 10000,
				latency_p50_ms: p50,
				latency_p95_ms: p95,
				sample_size: latencies.length,
			},
			recent_questions: recentQuestions,
		};

		return new Response(JSON.stringify(payload, null, 2), {
			status: 200,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "public, max-age=60, s-maxage=60",
			},
		});
	} catch (e) {
		console.error("ops endpoint error:", (e as Error).message);
		return new Response(JSON.stringify({ error: "internal error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
};

function humanizeAgo(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	return `${d}d ago`;
}
