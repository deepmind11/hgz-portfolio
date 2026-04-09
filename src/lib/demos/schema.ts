/**
 * Unified request/response schema for all live project demos.
 *
 * Every demo endpoint (/api/demo/<project>) follows this contract
 * so the shared <DemoRunner> React component can drive all of them
 * uniformly.
 */

export type DemoProject =
	| "variantagent"
	| "covalentagent"
	| "constella"
	| "clinic-ops-copilot";

export interface DemoRequest<T = unknown> {
	input: T;
}

export interface DemoResponse<T = unknown> {
	project: DemoProject;
	runId: string;
	result: T;
	metadata: {
		durationMs: number;
		cached: boolean;
		modelVersion?: string;
		notes?: string;
	};
	traceId?: string;
	/** Human-readable error summary if the run failed */
	error?: string;
}

export interface DemoError {
	error: string;
	project: DemoProject;
	code:
		| "bad_input"
		| "rate_limited"
		| "upstream_failed"
		| "not_implemented"
		| "server_error";
	retryAfterSeconds?: number;
}

// ============================================================
// Project-specific result shapes
// ============================================================

export interface VariantAgentInput {
	/** Format: `chr:pos:ref:alt` e.g. `17:43045712:A:G` */
	variant: string;
	assembly?: "GRCh37" | "GRCh38";
}

export interface VariantAgentResult {
	variant: {
		chromosome: string;
		position: number;
		ref: string;
		alt: string;
		assembly: string;
	};
	classification: "Pathogenic" | "Likely pathogenic" | "VUS" | "Likely benign" | "Benign" | "Unknown";
	criteriaApplied: Array<{
		code: string;
		weight: "PVS1" | "PS" | "PM" | "PP" | "BS" | "BP" | "BA1";
		evidence: string;
		source: string;
	}>;
	clinvar?: {
		id: string | null;
		interpretation: string | null;
		review_status: string | null;
		url: string | null;
	};
	gnomad?: {
		allele_frequency: number | null;
		allele_count: number | null;
		allele_number: number | null;
		popmax_af: number | null;
		url: string | null;
	};
	sources: string[];
	disclaimer: string;
}

export interface ClinicOpsInput {
	question: string;
}

export interface ClinicOpsResult {
	intent: "query" | "hypothesis" | "escalate" | "out_of_scope";
	narrative: string;
	sql?: string;
	rows?: Array<Record<string, unknown>>;
	columns?: string[];
	rowCount?: number;
	escalation?: {
		to: string;
		reason: string;
	};
	disclaimer: string;
}

export interface CovalentAgentInput {
	uniprot_id: string;
}

export interface CovalentAgentResult {
	uniprot_id: string;
	protein_name: string;
	sequence_length: number;
	cysteines: Array<{
		position: number;
		context: string;
		reactivity_score: number;
		notes: string;
	}>;
	stubbed: boolean;
	disclaimer: string;
}

export interface ConstellaInput {
	text: string;
	voice?: string;
}

export interface ConstellaResult {
	text: string;
	detected_spans: Array<{ lang: "en" | "es"; text: string }>;
	audio_url?: string;
	audio_format?: "wav" | "mp3";
	stubbed: boolean;
	disclaimer: string;
}
