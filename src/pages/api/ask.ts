/**
 * POST /api/ask
 *
 * Ask Harshit chatbot endpoint. SSE-streamed response.
 *
 * Request body:
 *   { messages: [{ role: "user" | "assistant", content: string }, ...] }
 *
 * Response: text/event-stream with events of shape
 *   data: {"type":"delta","text":"..."}\n\n
 *   data: {"type":"done","full":"..."}\n\n
 *   data: {"type":"error","message":"..."}\n\n
 *
 * Pipeline: rate limit → embed query → Vectorize topK → assemble prompt → stream OpenRouter → log to D1 + Langfuse.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { embed } from "../../lib/rag/embed";
import { retrieve } from "../../lib/rag/retrieve";
import { buildMessages } from "../../lib/rag/prompt";
import { streamChat, toClientSse, DEFAULT_MODEL } from "../../lib/llm/openrouter";
import { logChatTrace } from "../../lib/observability/langfuse";
import { checkRateLimit, hashIp } from "../../lib/rate-limit/check";

export const prerender = false;

const ALLOWED_ORIGINS = [
	"https://hgz-portfolio.harshitghosh.workers.dev",
	"http://localhost:4321",
	"http://localhost:8788",
];

function corsHeaders(origin: string | null): HeadersInit {
	const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
	return {
		"Access-Control-Allow-Origin": allow,
		"Access-Control-Allow-Methods": "POST, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, X-Eval-Token",
		Vary: "Origin",
	};
}

export const OPTIONS: APIRoute = ({ request }) => {
	return new Response(null, {
		status: 204,
		headers: corsHeaders(request.headers.get("origin")),
	});
};

export const POST: APIRoute = async ({ request, locals }) => {
	const ctx = (locals as { cfContext: ExecutionContext }).cfContext;
	const cors = corsHeaders(request.headers.get("origin"));
	const startTime = new Date().toISOString();
	const startMs = Date.now();

	// ---------- parse + validate ----------

	let body: { messages?: Array<{ role: string; content: string }>; sessionId?: string };
	try {
		body = await request.json();
	} catch {
		return jsonError(400, "Invalid JSON body", cors);
	}

	const messages = (body.messages ?? []).filter(
		(m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
	) as Array<{ role: "user" | "assistant"; content: string }>;

	if (messages.length === 0) {
		return jsonError(400, "messages is required", cors);
	}
	const lastUser = [...messages].reverse().find((m) => m.role === "user");
	if (!lastUser) return jsonError(400, "No user message found", cors);
	if (lastUser.content.length > 2000) {
		return jsonError(400, "Question too long (max 2000 chars)", cors);
	}
	if (lastUser.content.trim().length < 2) {
		return jsonError(400, "Question too short", cors);
	}

	const history = messages.slice(0, -1).slice(-6); // keep last 6 turns of context
	const sessionId = body.sessionId ?? crypto.randomUUID();

	// ---------- rate limit ----------

	// Eval / CI bypass: signed header unlocks the rate limiter.
	// EVAL_TOKEN is a Cloudflare secret, only known to the eval runner.
	const evalToken = request.headers.get("x-eval-token");
	const evalBypass =
		env.EVAL_TOKEN && evalToken && evalToken === env.EVAL_TOKEN;

	const ip =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown";
	const ipHash = await hashIp(ip);
	const limit = evalBypass
		? { allowed: true, remaining: 999, resetSeconds: 0, dailyRemaining: 999 }
		: await checkRateLimit(env.DB, ipHash);

	if (!limit.allowed) {
		return jsonError(
			429,
			limit.reason === "burst"
				? `Slow down — wait ${limit.resetSeconds}s`
				: `Daily limit reached. Email harshitghosh@gmail.com directly for more.`,
			cors,
			{
				"X-RateLimit-Remaining": String(limit.remaining),
				"X-RateLimit-Reset": String(limit.resetSeconds),
				"X-RateLimit-Daily-Remaining": String(limit.dailyRemaining),
			},
		);
	}

	// ---------- RAG ----------

	let chunks;
	try {
		const queryVector = await embed(env.AI, lastUser.content);
		chunks = await retrieve(env.VECTORIZE, queryVector, 8);
	} catch (e) {
		console.error("RAG error:", e);
		return jsonError(500, "Retrieval failed", cors);
	}

	const llmMessages = buildMessages(lastUser.content, chunks, history);

	// ---------- LLM stream ----------

	let upstream: Response;
	try {
		upstream = await streamChat({
			apiKey: env.OPENROUTER_API_KEY,
			model: DEFAULT_MODEL,
			messages: llmMessages,
			temperature: 0.3,
			maxTokens: 800,
			siteUrl: env.SITE_URL,
		});
	} catch (e) {
		console.error("OpenRouter error:", e);
		return jsonError(502, "LLM upstream failed", cors);
	}

	if (!upstream.body) {
		return jsonError(502, "LLM returned no body", cors);
	}

	// Tee the upstream so we can both stream to client AND collect for logging
	const [forClient, forLog] = upstream.body.tee();
	const clientStream = toClientSse(forClient);

	// Background: collect full text from log stream and send to D1 + Langfuse
	ctx.waitUntil(
		(async () => {
			try {
				const reader = forLog.getReader();
				const decoder = new TextDecoder();
				let raw = "";
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					raw += decoder.decode(value, { stream: true });
				}
				// Extract assistant content from SSE events
				let fullText = "";
				let promptTokens: number | undefined;
				let completionTokens: number | undefined;
				for (const line of raw.split("\n")) {
					if (!line.startsWith("data: ")) continue;
					const payload = line.slice(6).trim();
					if (payload === "[DONE]") continue;
					try {
						const json = JSON.parse(payload);
						const delta = json?.choices?.[0]?.delta?.content;
						if (typeof delta === "string") fullText += delta;
						if (json?.usage) {
							promptTokens = json.usage.prompt_tokens;
							completionTokens = json.usage.completion_tokens;
						}
					} catch {
						// partial JSON, skip
					}
				}

				const endTime = new Date().toISOString();
				const latencyMs = Date.now() - startMs;
				const traceId = crypto.randomUUID();

				// Log user + assistant messages to D1
				const userMsgId = crypto.randomUUID();
				const asstMsgId = crypto.randomUUID();
				try {
					await env.DB.batch([
						env.DB
							.prepare(
								"INSERT INTO chat_messages (id, session_id, created_at, role, content, user_ip_hash, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)",
							)
							.bind(
								userMsgId,
								sessionId,
								startMs,
								"user",
								lastUser.content,
								ipHash,
								request.headers.get("user-agent") ?? "",
							),
						env.DB
							.prepare(
								"INSERT INTO chat_messages (id, session_id, created_at, role, content, model, prompt_tokens, completion_tokens, latency_ms, retrieved_chunks, langfuse_trace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
							)
							.bind(
								asstMsgId,
								sessionId,
								Date.now(),
								"assistant",
								fullText,
								DEFAULT_MODEL,
								promptTokens ?? null,
								completionTokens ?? null,
								latencyMs,
								JSON.stringify(
									chunks.map((c) => ({ id: c.id, score: c.score, title: c.title })),
								),
								traceId,
							),
					]);
				} catch (e) {
					console.warn("D1 log failed:", (e as Error).message);
				}

				// Log to Langfuse
				if (env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY) {
					await logChatTrace(
						{
							publicKey: env.LANGFUSE_PUBLIC_KEY,
							secretKey: env.LANGFUSE_SECRET_KEY,
							baseUrl: env.LANGFUSE_BASE_URL ?? "https://us.cloud.langfuse.com",
						},
						{
							traceId,
							name: "ask-harshit",
							input: { question: lastUser.content, history },
							output: fullText,
							model: DEFAULT_MODEL,
							startTime,
							endTime,
							usage: {
								promptTokens,
								completionTokens,
								totalTokens:
									promptTokens != null && completionTokens != null
										? promptTokens + completionTokens
										: undefined,
							},
							metadata: {
								sessionId,
								latencyMs,
								retrievedChunks: chunks.map((c) => ({
									id: c.id,
									score: c.score,
									title: c.title,
								})),
							},
						},
					);
				}
			} catch (e) {
				console.warn("Background log task failed:", (e as Error).message);
			}
		})(),
	);

	return new Response(clientStream, {
		status: 200,
		headers: {
			...cors,
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Session-Id": sessionId,
			"X-RateLimit-Remaining": String(limit.remaining),
			"X-RateLimit-Daily-Remaining": String(limit.dailyRemaining),
		},
	});
};

function jsonError(status: number, message: string, cors: HeadersInit, extra: HeadersInit = {}) {
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: { ...cors, ...extra, "Content-Type": "application/json" },
	});
}
