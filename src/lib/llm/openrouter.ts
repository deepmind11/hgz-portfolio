/**
 * OpenRouter streaming client.
 *
 * Uses OpenAI-compatible chat completions over OpenRouter, returning a streaming
 * Response that can be piped directly back to the browser as Server-Sent Events.
 *
 * Default model: google/gemini-2.0-flash-001 (cheap, fast, ~1M context)
 * Escalation model: anthropic/claude-sonnet-4.5 (used by /ask?escalate=1, future)
 */

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface OpenRouterOptions {
	apiKey: string;
	model?: string;
	messages: ChatMessage[];
	temperature?: number;
	maxTokens?: number;
	siteUrl?: string;
	siteName?: string;
}

export const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
export const ESCALATION_MODEL = "anthropic/claude-sonnet-4.5";

export async function streamChat(opts: OpenRouterOptions): Promise<Response> {
	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${opts.apiKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": opts.siteUrl ?? "https://hgz-portfolio.harshitghosh.workers.dev",
			"X-Title": opts.siteName ?? "Harshit Ghosh — Portfolio",
		},
		body: JSON.stringify({
			model: opts.model ?? DEFAULT_MODEL,
			messages: opts.messages,
			temperature: opts.temperature ?? 0.3,
			max_tokens: opts.maxTokens ?? 800,
			stream: true,
		}),
	});

	if (!res.ok || !res.body) {
		const errorText = await res.text().catch(() => "(no body)");
		throw new Error(`OpenRouter ${res.status}: ${errorText}`);
	}

	return res;
}

/**
 * Parse an OpenRouter SSE chunk into delta text.
 * Each line is `data: {json}` or `data: [DONE]`.
 */
export function parseSseChunk(text: string): { delta: string; done: boolean } {
	let delta = "";
	let done = false;
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("data:")) continue;
		const payload = trimmed.slice(5).trim();
		if (payload === "[DONE]") {
			done = true;
			continue;
		}
		try {
			const json = JSON.parse(payload);
			const content = json?.choices?.[0]?.delta?.content;
			if (typeof content === "string") delta += content;
		} catch {
			// SSE chunks can be partial; the consumer will buffer.
		}
	}
	return { delta, done };
}

/**
 * Convert OpenRouter SSE stream to a clean text-only stream for the client.
 * Re-emits as `data: {text}\n\n` SSE for browser EventSource consumption.
 */
export function toClientSse(upstream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = "";
	let collected = "";

	return new ReadableStream({
		async start(controller) {
			const reader = upstream.getReader();
			try {
				while (true) {
					const { value, done } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });

					// Process complete SSE events (separated by \n\n)
					let idx;
					while ((idx = buffer.indexOf("\n\n")) !== -1) {
						const event = buffer.slice(0, idx);
						buffer = buffer.slice(idx + 2);
						const { delta, done: streamDone } = parseSseChunk(event);
						if (delta) {
							collected += delta;
							controller.enqueue(
								encoder.encode(`data: ${JSON.stringify({ type: "delta", text: delta })}\n\n`),
							);
						}
						if (streamDone) {
							controller.enqueue(
								encoder.encode(
									`data: ${JSON.stringify({ type: "done", full: collected })}\n\n`,
								),
							);
						}
					}
				}
			} catch (e) {
				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ type: "error", message: (e as Error).message })}\n\n`,
					),
				);
			} finally {
				controller.close();
				reader.releaseLock();
			}
		},
	});
}
