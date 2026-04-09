/**
 * POST /api/demo/covalentagent
 *
 * Stub endpoint. The real demo needs a Python backend on Modal
 * (ESM-2 inference for reactive-cysteine prediction). Until the
 * Modal deploy lands, this returns a 501 with guidance.
 */

import type { APIRoute } from "astro";
import type { DemoError } from "../../../lib/demos/schema";

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

export const POST: APIRoute = ({ request }) => {
	const cors = corsHeaders(request.headers.get("origin"));
	const body: DemoError = {
		error:
			"The CovalentAgent live demo runs ESM-2 inference on Python, which needs a GPU sandbox. The Modal backend is built (see modal/covalentagent/) but not yet deployed in this environment. Clone the repo and run it locally, or follow the project page for updates.",
		project: PROJECT,
		code: "not_implemented",
	};
	return new Response(JSON.stringify(body), {
		status: 501,
		headers: { ...cors, "Content-Type": "application/json" },
	});
};
