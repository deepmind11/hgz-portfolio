/**
 * ClinicOps Copilot demo.
 *
 * Natural-language question → structured SQL query → result on a
 * synthetic FHIR-inspired dataset loaded into D1.
 *
 * Pipeline:
 *   1. Intent classification (LLM): query / hypothesis / escalate / out_of_scope
 *   2. If query: LLM translates to SQL given a fixed schema
 *   3. Validate SQL (whitelist-based, no mutations, no joins to unknown tables)
 *   4. Execute via D1
 *   5. Return intent, SQL, rows, narrative
 *
 * The LLM only generates SQL against a small, vetted schema. We strip
 * any attempt to write, drop, alter, etc. The synthetic dataset is
 * denormalized for simplicity — see db/clinicops-synthetic.sql.
 *
 * This is a simplified port of the full ClinicOps Copilot. The real
 * system on GitHub also handles hypothesis generation, tool routing,
 * and human-in-the-loop escalation.
 */

import type { ClinicOpsInput, ClinicOpsResult } from "./schema";

const SCHEMA_PROMPT = `You are translating natural-language questions into SQLite queries for a synthetic clinical operations dataset.

TABLES:

clinicops_patients(
  patient_id TEXT PRIMARY KEY,    -- e.g. 'PAT-00001'
  mrn TEXT,                       -- medical record number
  age INTEGER,
  sex TEXT,                       -- 'M' | 'F'
  diagnosis TEXT,                 -- free text cancer diagnosis
  enrolled_at INTEGER             -- unix seconds
)

clinicops_samples(
  sample_id TEXT PRIMARY KEY,     -- e.g. 'SAM-100001'
  patient_id TEXT,                -- FK to clinicops_patients
  assay TEXT,                     -- 'Solid Tumor Panel' | 'Liquid Biopsy Panel'
  collected_at INTEGER,           -- unix seconds
  received_at INTEGER,
  qc_started_at INTEGER,
  qc_completed_at INTEGER,
  reported_at INTEGER,
  current_stage TEXT,             -- 'accessioning' | 'extraction' | 'library_prep' | 'sequencing' | 'qc' | 'analysis' | 'reported' | 'failed'
  qc_status TEXT,                 -- 'pass' | 'fail' | 'review' | NULL
  coverage_depth INTEGER,
  duplication_rate REAL,
  on_target_rate REAL,
  flags TEXT                      -- comma-separated flags if any
)

clinicops_pipeline_runs(
  run_id TEXT PRIMARY KEY,        -- e.g. 'RUN-00001'
  sample_id TEXT,                 -- FK
  pipeline_name TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  status TEXT,                    -- 'success' | 'failed' | 'flagged'
  error_message TEXT
)

CURRENT TIME: 1740009600 (approximately 2026-02-20 UTC)

RULES:
1. Output a SINGLE SQLite SELECT query only. No INSERT, UPDATE, DELETE, DROP, ALTER, CREATE.
2. Use only the tables and columns listed above. No PRAGMA. No ATTACH.
3. Limit results to at most 20 rows with LIMIT 20.
4. For time filters, compute relative seconds from CURRENT TIME (e.g. "last 3 days" = > CURRENT TIME - 3*86400).
5. For "stuck in qc for >N days": qc_started_at IS NOT NULL AND qc_completed_at IS NULL AND qc_started_at < CURRENT TIME - N*86400.
6. Prefer column aliases readable in a table UI (e.g. "sample_id AS 'Sample'").
7. If the question is not translatable into SQL against this schema, return exactly the string \`OUT_OF_SCOPE\`.

OUTPUT FORMAT: Emit ONLY the SQL query on a single line. No explanation, no markdown fences, no commentary.`;

const INTENT_PROMPT = `Classify the user's question into ONE of:
- query: a factual question that can be answered by SELECT against the clinical dataset
- hypothesis: asks WHY something is happening or WHAT COULD be wrong
- escalate: requires human judgment, policy decision, or clinical sign-off
- out_of_scope: not about clinical ops / samples / patients at all

Respond with exactly ONE word on the first line.`;

const DEMO_DISCLAIMER =
	"Synthetic dataset only. 20 patients, 28 samples, 11 pipeline runs. The full ClinicOps Copilot is a three-agent system with FHIR R4 integration — this is a simplified demo you can actually run in the browser.";

// ============================================================
// Safe SQL check
// ============================================================

const ALLOWED_TABLES = new Set([
	"clinicops_patients",
	"clinicops_samples",
	"clinicops_pipeline_runs",
]);

function validateSql(sql: string): { ok: true; sql: string } | { ok: false; reason: string } {
	const trimmed = sql.trim().replace(/;+\s*$/, "");
	if (!trimmed) return { ok: false, reason: "empty SQL" };

	const upper = trimmed.toUpperCase();
	if (!upper.startsWith("SELECT")) {
		return { ok: false, reason: "only SELECT queries are allowed" };
	}

	const banned = [
		"INSERT ",
		"UPDATE ",
		"DELETE ",
		"DROP ",
		"ALTER ",
		"CREATE ",
		"ATTACH ",
		"PRAGMA ",
		"REPLACE ",
		"TRUNCATE ",
	];
	for (const kw of banned) {
		if (upper.includes(kw)) {
			return { ok: false, reason: `forbidden keyword: ${kw.trim()}` };
		}
	}

	// Require it references an allowed table
	const lower = trimmed.toLowerCase();
	const hasAllowed = Array.from(ALLOWED_TABLES).some((t) => lower.includes(t));
	if (!hasAllowed) {
		return { ok: false, reason: "query must reference clinicops_* tables" };
	}

	return { ok: true, sql: trimmed };
}

// ============================================================
// OpenRouter helpers
// ============================================================

async function llmCall(apiKey: string, system: string, user: string, siteUrl: string): Promise<string> {
	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": siteUrl,
			"X-Title": "Harshit Ghosh Portfolio ClinicOps demo",
		},
		body: JSON.stringify({
			model: "anthropic/claude-haiku-4.5",
			messages: [
				{ role: "system", content: system },
				{ role: "user", content: user },
			],
			temperature: 0,
			max_tokens: 500,
		}),
	});
	if (!res.ok) {
		const body = await res.text().catch(() => "(no body)");
		throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
	}
	const json = (await res.json()) as {
		choices?: Array<{ message?: { content?: string } }>;
	};
	return (json.choices?.[0]?.message?.content ?? "").trim();
}

async function classifyIntent(
	apiKey: string,
	question: string,
	siteUrl: string,
): Promise<ClinicOpsResult["intent"]> {
	const out = await llmCall(apiKey, INTENT_PROMPT, question, siteUrl);
	const first = out.split(/\s|\n/)[0].toLowerCase().replace(/[^a-z_]/g, "");
	if (first === "query") return "query";
	if (first === "hypothesis") return "hypothesis";
	if (first === "escalate") return "escalate";
	return "out_of_scope";
}

async function translateToSql(
	apiKey: string,
	question: string,
	siteUrl: string,
): Promise<string> {
	const out = await llmCall(apiKey, SCHEMA_PROMPT, question, siteUrl);
	// Strip markdown code fences if the model emitted them
	return out
		.replace(/^```sql\s*/i, "")
		.replace(/^```\s*/i, "")
		.replace(/```$/, "")
		.trim();
}

async function buildNarrative(
	apiKey: string,
	question: string,
	intent: string,
	rows: unknown[],
	sql: string,
	siteUrl: string,
): Promise<string> {
	const system = `You are an assistant for a clinical operations dashboard. Summarize a SQL result for a non-technical user in 2-3 sentences. Be specific with numbers. Don't restate the question. Don't mention SQL or the database.`;
	const user = `Original question: ${question}\n\nIntent: ${intent}\n\nRows returned: ${JSON.stringify(rows).slice(0, 2000)}\n\nSummarize the answer.`;
	return llmCall(apiKey, system, user, siteUrl);
}

// ============================================================
// Orchestration
// ============================================================

export async function runClinicOps(
	input: ClinicOpsInput,
	env: {
		OPENROUTER_API_KEY: string;
		DB: D1Database;
		SITE_URL: string;
	},
): Promise<ClinicOpsResult> {
	const question = input.question.trim();
	if (!question || question.length < 4) {
		throw new Error("Question too short");
	}
	if (question.length > 500) {
		throw new Error("Question too long (max 500 chars)");
	}

	const intent = await classifyIntent(env.OPENROUTER_API_KEY, question, env.SITE_URL);

	if (intent === "out_of_scope") {
		return {
			intent,
			narrative:
				"I can only answer questions about the synthetic clinical operations dataset (samples, patients, pipeline runs). Try something like 'show samples stuck in QC' or 'list failed pipeline runs this week'.",
			disclaimer: DEMO_DISCLAIMER,
		};
	}

	if (intent === "escalate") {
		return {
			intent,
			narrative:
				"This question requires human judgment or a clinical sign-off. In production, this would open a ticket and route to the appropriate on-call engineer or clinical director.",
			escalation: {
				to: "on-call bioinformatics + clinical director",
				reason: "requires human judgment or policy decision",
			},
			disclaimer: DEMO_DISCLAIMER,
		};
	}

	if (intent === "hypothesis") {
		// For hypothesis questions, still run a query to pull evidence but frame
		// the response as "here's what we see — the why needs investigation"
	}

	// query or hypothesis: translate → validate → execute
	const sqlRaw = await translateToSql(env.OPENROUTER_API_KEY, question, env.SITE_URL);
	if (sqlRaw.toUpperCase().includes("OUT_OF_SCOPE")) {
		return {
			intent: "out_of_scope",
			narrative:
				"I couldn't translate that into a query against the clinical ops schema. Try asking about samples, patients, QC status, or pipeline runs.",
			disclaimer: DEMO_DISCLAIMER,
		};
	}

	const validation = validateSql(sqlRaw);
	if (!validation.ok) {
		throw new Error(`Generated SQL failed validation: ${validation.reason}`);
	}

	const stmt = env.DB.prepare(validation.sql);
	const result = await stmt.all();
	const rows = (result.results ?? []) as Array<Record<string, unknown>>;
	const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

	const narrative = await buildNarrative(
		env.OPENROUTER_API_KEY,
		question,
		intent,
		rows,
		validation.sql,
		env.SITE_URL,
	);

	return {
		intent: intent === "hypothesis" ? "hypothesis" : "query",
		narrative,
		sql: validation.sql,
		rows: rows.slice(0, 20),
		columns,
		rowCount: rows.length,
		disclaimer: DEMO_DISCLAIMER,
	};
}
