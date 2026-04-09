/**
 * POST /api/demo/constella
 *
 * Worker-native language-span detector. The browser handles
 * synthesis via Web Speech API — see ConstellaDemo.tsx.
 */

import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { runConstella } from "../../../lib/demos/constella";
import { cacheGet, cachePut, hashInput } from "../../../lib/demos/cache";
import { checkDemoRateLimit, hashIpForDemo } from "../../../lib/demos/rate-limit";
import type {
	ConstellaInput,
	ConstellaResult,
	DemoError,
	DemoResponse,
} from "../../../lib/demos/schema";

export const prerender = false;

const PROJECT = "constella" as const;

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

	let body: { input?: ConstellaInput };
	try {
		body = await request.json();
	} catch {
		return errorResponse(cors, "bad_input", "Invalid JSON body", 400);
	}
	const input = body.input;
	if (!input || typeof input.text !== "string") {
		return errorResponse(cors, "bad_input", "input.text is required", 400);
	}
	if (input.text.length > 300) {
		return errorResponse(cors, "bad_input", "text too long (max 300 chars)", 400);
	}

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

	const inputHash = await hashInput(input);
	const cached = await cacheGet<ConstellaResult>(env.DEMO_CACHE, PROJECT, inputHash);
	if (cached) return successResponse(cors, cached, limit);

	let result: ConstellaResult;
	try {
		result = runConstella(input);
	} catch (e) {
		const msg = (e as Error).message || "unexpected error";
		return errorResponse(cors, "bad_input", msg, 400);
	}

	const response: DemoResponse<ConstellaResult> = {
		project: PROJECT,
		runId: crypto.randomUUID(),
		result,
		metadata: {
			durationMs: Date.now() - start,
			cached: false,
			modelVersion: "v0.1-span-detector",
			notes: "Rule-based span detection on Workers. Browser handles TTS via Web Speech API.",
		},
	};

	await cachePut(env.DEMO_CACHE, PROJECT, inputHash, response);
	return successResponse(cors, response, limit);
};

function successResponse(
	cors: HeadersInit,
	response: DemoResponse<ConstellaResult>,
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
