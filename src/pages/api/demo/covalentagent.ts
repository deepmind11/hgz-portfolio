/**
 * POST /api/demo/covalentagent
 *
 * Worker proxy to the Modal-hosted ESM-2 cysteine scorer.
 *
 * Flow: rate limit → KV cache → proxy to Modal (signed header) → cache → return.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { cacheGet, cachePut, hashInput } from "../../../lib/demos/cache";
import { checkDemoRateLimit, hashIpForDemo } from "../../../lib/demos/rate-limit";
import type {
	CovalentAgentInput,
	CovalentAgentResult,
	DemoError,
	DemoResponse,
} from "../../../lib/demos/schema";

export const prerender = false;

const PROJECT = "covalentagent" as const;

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
		"Access-Control-Allow-Headers": "Content-Type",
		Vary: "Origin",
	};
}

export const OPTIONS: APIRoute = ({ request }) =>
	new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });

export const POST: APIRoute = async ({ request }) => {
	const cors = corsHeaders(request.headers.get("origin"));
	const start = Date.now();

	let body: { input?: CovalentAgentInput };
	try {
		body = await request.json();
	} catch {
		return errorResponse(cors, "bad_input", "Invalid JSON body", 400);
	}
	const input = body.input;
	if (!input || typeof input.uniprot_id !== "string") {
		return errorResponse(cors, "bad_input", "input.uniprot_id is required", 400);
	}
	const uniprotId = input.uniprot_id.trim().toUpperCase();
	if (!/^[A-Z][0-9][A-Z0-9]{3}[0-9]$|^[A-Z][0-9][A-Z0-9]{3}[0-9][A-Z0-9]{5}$/.test(uniprotId)) {
		return errorResponse(
			cors,
			"bad_input",
			"uniprot_id must be a UniProtKB accession (e.g. P01116)",
			400,
		);
	}

	// Modal proxy requires the backend + shared secret to be configured
	if (!env.MODAL_COVALENTAGENT_URL || !env.MODAL_SHARED_SECRET) {
		return errorResponse(
			cors,
			"not_implemented",
			"Modal backend is not configured on this worker. See modal/covalentagent/.",
			501,
		);
	}

	// Rate limit
	const ip =
		request.headers.get("cf-connecting-ip") ??
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
		"unknown";
	const ipHash = await hashIpForDemo(ip);
	const limit = await checkDemoRateLimit(env.DEMO_CACHE, PROJECT, ipHash);
	if (!limit.allowed) {
		return errorResponse(
			cors,
			"rate_limited",
			limit.reason === "burst"
				? `Slow down — wait ${limit.resetSeconds}s`
				: "Daily limit reached for this demo",
			429,
			{
				"X-RateLimit-Remaining": String(limit.remaining),
				"X-RateLimit-Reset": String(limit.resetSeconds),
				"X-RateLimit-Daily-Remaining": String(limit.dailyRemaining),
			},
		);
	}

	const inputHash = await hashInput({ uniprot_id: uniprotId });
	const cached = await cacheGet<CovalentAgentResult>(env.DEMO_CACHE, PROJECT, inputHash);
	if (cached) return successResponse(cors, cached, limit);

	// Proxy to Modal
	let result: CovalentAgentResult;
	try {
		const modalRes = await fetch(env.MODAL_COVALENTAGENT_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-Modal-Auth": env.MODAL_SHARED_SECRET,
			},
			body: JSON.stringify({
				uniprot_id: uniprotId,
				_auth: env.MODAL_SHARED_SECRET,
			}),
		});
		if (!modalRes.ok) {
			const errBody = await modalRes.text().catch(() => "(no body)");
			if (modalRes.status === 404) {
				return errorResponse(cors, "bad_input", `UniProt ID ${uniprotId} not found`, 404);
			}
			console.error("modal upstream error:", modalRes.status, errBody);
			return errorResponse(cors, "upstream_failed", "Modal backend failed", 502);
		}
		result = (await modalRes.json()) as CovalentAgentResult;
	} catch (e) {
		console.error("covalentagent proxy error:", e);
		return errorResponse(cors, "upstream_failed", "Could not reach Modal backend", 502);
	}

	const response: DemoResponse<CovalentAgentResult> = {
		project: PROJECT,
		runId: crypto.randomUUID(),
		result,
		metadata: {
			durationMs: Date.now() - start,
			cached: false,
			modelVersion: "esm2_t12_35M_UR50D",
			notes: "ESM-2 embedding variance + CXXC/CXC motif detection on Modal CPU.",
		},
	};

	await cachePut(env.DEMO_CACHE, PROJECT, inputHash, response);
	return successResponse(cors, response, limit);
};

function successResponse(
	cors: HeadersInit,
	response: DemoResponse<CovalentAgentResult>,
	limit: { remaining: number; dailyRemaining: number },
) {
	return new Response(JSON.stringify(response), {
		status: 200,
		headers: {
			...cors,
			"Content-Type": "application/json",
			"X-RateLimit-Remaining": String(limit.remaining),
			"X-RateLimit-Daily-Remaining": String(limit.dailyRemaining),
		},
	});
}

function errorResponse(
	cors: HeadersInit,
	code: DemoError["code"],
	message: string,
	status: number,
	extra: HeadersInit = {},
) {
	const body: DemoError = { error: message, project: PROJECT, code };
	return new Response(JSON.stringify(body), {
		status,
		headers: { ...cors, ...extra, "Content-Type": "application/json" },
	});
}
