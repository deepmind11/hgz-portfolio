#!/usr/bin/env node
/**
 * Eval runner for the Ask Harshit chatbot.
 *
 * Usage:
 *   node evals/run.mjs                                    # runs against default prod URL
 *   node evals/run.mjs --url=http://localhost:4321        # local dev
 *   node evals/run.mjs --filter=factuality                # only factuality cases
 *   node evals/run.mjs --fail-threshold=0.9               # fail if pass rate < 0.9
 *   node evals/run.mjs --out=eval-report.json             # write JSON report
 *
 * Exit codes:
 *   0  → all blocking cases passed AND overall pass rate ≥ threshold
 *   1  → blocking failure or pass rate below threshold
 *   2  → runner error (network, setup, etc.)
 */

import cases from "./cases.mjs";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ---------- args ----------

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith("--"))
		.map((a) => {
			const [k, ...v] = a.slice(2).split("=");
			return [k, v.length ? v.join("=") : "true"];
		}),
);

const DEFAULT_URL = "https://hgz-portfolio.harshitghosh.workers.dev";
const BASE_URL = (args.url || DEFAULT_URL).replace(/\/$/, "");
const THRESHOLD = Number.parseFloat(args["fail-threshold"] ?? "0.9");
const FILTER = args.filter;
const OUT_FILE = args.out;

// ---------- load OpenRouter key for judge ----------

function loadEnv() {
	const envFile = join(ROOT, ".env");
	if (!existsSync(envFile)) return {};
	const out = {};
	for (const line of readFileSync(envFile, "utf8").split("\n")) {
		const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
		if (m && !line.startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
	return out;
}

const envVars = { ...loadEnv(), ...process.env };
const JUDGE_KEY = envVars.OPENROUTER_API_KEY;
const EVAL_TOKEN = envVars.EVAL_TOKEN;

if (!EVAL_TOKEN) {
	console.warn(
		"\x1b[33mWARN\x1b[0m: EVAL_TOKEN not set — will hit production rate limits. Pass via env or .env file.",
	);
}

// ---------- ask the chatbot ----------

async function ask(question) {
	const headers = { "Content-Type": "application/json" };
	if (EVAL_TOKEN) headers["X-Eval-Token"] = EVAL_TOKEN;

	const res = await fetch(`${BASE_URL}/api/ask`, {
		method: "POST",
		headers,
		body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "(no body)");
		throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
	}

	if (!res.body) throw new Error("No response body");
	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let full = "";

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		let idx;
		while ((idx = buffer.indexOf("\n\n")) !== -1) {
			const event = buffer.slice(0, idx);
			buffer = buffer.slice(idx + 2);
			if (!event.startsWith("data:")) continue;
			try {
				const payload = JSON.parse(event.slice(5).trim());
				if (payload.type === "delta") full += payload.text;
				else if (payload.type === "done" && payload.full) full = payload.full;
				else if (payload.type === "error")
					throw new Error(`Stream error: ${payload.message}`);
			} catch (e) {
				if (e instanceof SyntaxError) continue;
				throw e;
			}
		}
	}

	return full.trim();
}

// ---------- assertions ----------

function assert(answer, rule) {
	const lower = answer.toLowerCase();
	switch (rule.type) {
		case "contains":
			return {
				pass: lower.includes(rule.value.toLowerCase()),
				message: `expected to contain "${rule.value}"`,
			};
		case "contains_all":
			for (const v of rule.values) {
				if (!lower.includes(v.toLowerCase()))
					return { pass: false, message: `missing required term "${v}"` };
			}
			return { pass: true, message: "" };
		case "contains_any": {
			const found = rule.values.filter((v) => lower.includes(v.toLowerCase()));
			return {
				pass: found.length > 0,
				message:
					found.length > 0
						? ""
						: `expected at least one of: ${rule.values.map((v) => `"${v}"`).join(", ")}`,
			};
		}
		case "not_contains":
			return {
				pass: !lower.includes(rule.value.toLowerCase()),
				message: `should NOT contain "${rule.value}"`,
			};
		case "not_contains_any": {
			const hit = rule.values.find((v) => lower.includes(v.toLowerCase()));
			return {
				pass: !hit,
				message: hit ? `found forbidden term "${hit}"` : "",
			};
		}
		case "max_length_chars":
			return {
				pass: answer.length <= rule.value,
				message: `answer length ${answer.length} > ${rule.value}`,
			};
		default:
			return { pass: false, message: `unknown rule type ${rule.type}` };
	}
}

async function llmJudge(question, answer, criteria) {
	if (!JUDGE_KEY) {
		return {
			pass: false,
			message: "OPENROUTER_API_KEY not set for LLM judge",
			raw: "",
		};
	}

	const judgePrompt = `You are evaluating whether an AI chatbot answer meets a quality criterion.

QUESTION: ${question}

ANSWER: ${answer}

CRITERIA: ${criteria}

Respond with exactly ONE word on the first line: PASS or FAIL.
On the second line, give a 1-sentence justification.`;

	const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${JUDGE_KEY}`,
			"Content-Type": "application/json",
			"HTTP-Referer": "https://hgz-portfolio.harshitghosh.workers.dev",
			"X-Title": "Harshit Ghosh Portfolio evals",
		},
		body: JSON.stringify({
			model: "anthropic/claude-haiku-4.5",
			messages: [{ role: "user", content: judgePrompt }],
			temperature: 0,
			max_tokens: 150,
		}),
	});

	if (!res.ok) {
		const body = await res.text().catch(() => "(no body)");
		return { pass: false, message: `judge HTTP ${res.status}: ${body.slice(0, 100)}`, raw: "" };
	}

	const json = await res.json();
	const content = json?.choices?.[0]?.message?.content?.trim() ?? "";
	const firstLine = content.split("\n")[0].trim().toUpperCase();
	const pass = firstLine === "PASS";
	return {
		pass,
		message: pass ? "" : `judge: ${content.slice(0, 200)}`,
		raw: content,
	};
}

// ---------- runner ----------

async function runCase(testCase) {
	const start = Date.now();
	const result = {
		name: testCase.name,
		category: testCase.category,
		criticality: testCase.criticality,
		question: testCase.question,
		answer: "",
		latencyMs: 0,
		checks: [],
		passed: false,
		error: null,
	};

	try {
		result.answer = await ask(testCase.question);
		result.latencyMs = Date.now() - start;

		let allPassed = true;
		for (const rule of testCase.expect) {
			if (rule.type === "llm_judge") {
				const r = await llmJudge(testCase.question, result.answer, rule.criteria);
				result.checks.push({ type: "llm_judge", pass: r.pass, message: r.message });
				if (!r.pass) allPassed = false;
			} else {
				const r = assert(result.answer, rule);
				result.checks.push({ type: rule.type, pass: r.pass, message: r.message });
				if (!r.pass) allPassed = false;
			}
		}
		result.passed = allPassed;
	} catch (e) {
		result.error = (e).message;
		result.passed = false;
	}

	return result;
}

async function main() {
	const selected = FILTER ? cases.filter((c) => c.category === FILTER || c.name === FILTER) : cases;
	if (selected.length === 0) {
		console.error(`No cases matched filter "${FILTER}"`);
		process.exit(2);
	}

	console.log(`Running ${selected.length} cases against ${BASE_URL}`);
	console.log(`Threshold: ${(THRESHOLD * 100).toFixed(0)}% pass rate + zero blocking failures\n`);

	const results = [];
	const startMs = Date.now();

	for (const c of selected) {
		process.stdout.write(`  ▸ ${c.name.padEnd(30)} `);
		const r = await runCase(c);
		results.push(r);
		const tag = r.passed ? "PASS" : c.criticality === "blocking" ? "FAIL ✗" : "fail ·";
		const color = r.passed ? "\x1b[32m" : c.criticality === "blocking" ? "\x1b[31m" : "\x1b[33m";
		process.stdout.write(`${color}${tag}\x1b[0m  (${r.latencyMs}ms)\n`);
		if (!r.passed && r.error) {
			console.log(`      error: ${r.error}`);
		} else if (!r.passed) {
			for (const ch of r.checks.filter((x) => !x.pass)) {
				console.log(`      - ${ch.type}: ${ch.message}`);
			}
		}
	}

	const wallMs = Date.now() - startMs;

	// ---------- aggregate ----------

	const total = results.length;
	const passed = results.filter((r) => r.passed).length;
	const passRate = total > 0 ? passed / total : 0;
	const blockingFailed = results.filter(
		(r) => !r.passed && r.criticality === "blocking",
	);

	const byCategory = {};
	for (const r of results) {
		if (!byCategory[r.category]) byCategory[r.category] = { total: 0, passed: 0 };
		byCategory[r.category].total++;
		if (r.passed) byCategory[r.category].passed++;
	}

	console.log("\n==================================================");
	console.log("  Eval summary");
	console.log("==================================================");
	console.log(`  Total: ${passed}/${total}  (${(passRate * 100).toFixed(1)}%)`);
	console.log(`  Wall time: ${(wallMs / 1000).toFixed(1)}s`);
	console.log(`  By category:`);
	for (const [cat, stats] of Object.entries(byCategory)) {
		console.log(`    ${cat.padEnd(12)} ${stats.passed}/${stats.total}`);
	}
	console.log(`  Blocking failures: ${blockingFailed.length}`);
	if (blockingFailed.length > 0) {
		console.log(`    ${blockingFailed.map((r) => r.name).join(", ")}`);
	}

	// ---------- decision ----------

	let exitCode = 0;
	const reasons = [];
	if (blockingFailed.length > 0) {
		exitCode = 1;
		reasons.push(`${blockingFailed.length} blocking case(s) failed`);
	}
	if (passRate < THRESHOLD) {
		exitCode = 1;
		reasons.push(`pass rate ${(passRate * 100).toFixed(1)}% < ${(THRESHOLD * 100).toFixed(0)}% threshold`);
	}

	if (exitCode === 0) {
		console.log("\n  \x1b[32m✓ EVAL GATE PASSED\x1b[0m");
	} else {
		console.log(`\n  \x1b[31m✗ EVAL GATE FAILED:\x1b[0m ${reasons.join("; ")}`);
	}
	console.log("==================================================\n");

	// ---------- persist report ----------

	if (OUT_FILE) {
		const report = {
			timestamp: new Date().toISOString(),
			baseUrl: BASE_URL,
			threshold: THRESHOLD,
			summary: {
				total,
				passed,
				passRate,
				byCategory,
				blockingFailures: blockingFailed.map((r) => r.name),
				wallMs,
				passed_gate: exitCode === 0,
			},
			cases: results,
		};
		writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
		console.log(`Report: ${OUT_FILE}`);
	}

	process.exit(exitCode);
}

main().catch((e) => {
	console.error("\n\x1b[31mRunner error:\x1b[0m", e.message);
	process.exit(2);
});
