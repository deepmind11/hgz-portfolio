/**
 * Minimal Langfuse client for the Cloudflare Workers runtime.
 *
 * The official `langfuse` npm package depends on Node APIs and is heavy.
 * For the Worker runtime we just hit the Langfuse ingest endpoint directly.
 *
 * Docs: https://langfuse.com/docs/integrations/api
 * Endpoint: POST {LANGFUSE_BASE_URL}/api/public/ingestion
 * Body: { batch: [event, ...] }
 * Auth: Basic auth with public_key:secret_key
 */

export interface LangfuseConfig {
	publicKey: string;
	secretKey: string;
	baseUrl: string;
}

export interface TraceInput {
	traceId: string;
	name: string;
	input: unknown;
	output: unknown;
	model: string;
	metadata?: Record<string, unknown>;
	startTime: string;
	endTime: string;
	usage?: {
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
	};
}

function genId() {
	return crypto.randomUUID();
}

/**
 * Send a single chat trace to Langfuse. Fails open — logs warning but doesn't throw.
 * Designed to run inside ctx.waitUntil() so it doesn't block the response.
 */
export async function logChatTrace(cfg: LangfuseConfig, t: TraceInput): Promise<void> {
	const auth = btoa(`${cfg.publicKey}:${cfg.secretKey}`);
	const generationId = genId();

	const batch = [
		{
			id: genId(),
			type: "trace-create",
			timestamp: t.startTime,
			body: {
				id: t.traceId,
				name: t.name,
				timestamp: t.startTime,
				input: t.input,
				output: t.output,
				metadata: t.metadata ?? {},
				public: false,
			},
		},
		{
			id: genId(),
			type: "generation-create",
			timestamp: t.startTime,
			body: {
				id: generationId,
				traceId: t.traceId,
				name: "openrouter-completion",
				startTime: t.startTime,
				endTime: t.endTime,
				model: t.model,
				input: t.input,
				output: t.output,
				usage: t.usage
					? {
							input: t.usage.promptTokens,
							output: t.usage.completionTokens,
							total: t.usage.totalTokens,
							unit: "TOKENS",
						}
					: undefined,
			},
		},
	];

	try {
		const res = await fetch(`${cfg.baseUrl}/api/public/ingestion`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${auth}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ batch }),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "(no body)");
			console.warn(`Langfuse ingest ${res.status}: ${body}`);
		}
	} catch (e) {
		console.warn("Langfuse ingest failed:", (e as Error).message);
	}
}
