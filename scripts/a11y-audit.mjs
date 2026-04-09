#!/usr/bin/env node
/**
 * axe-core accessibility audit across the live site.
 *
 * Spawns headless Chrome via puppeteer, runs axe-core on each page,
 * and reports violations grouped by impact (critical / serious /
 * moderate / minor).
 *
 * Usage:
 *   node scripts/a11y-audit.mjs
 *   node scripts/a11y-audit.mjs --url=http://localhost:4321
 */

import puppeteer from "puppeteer";
import { AxePuppeteer } from "@axe-core/puppeteer";

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((a) => a.startsWith("--"))
		.map((a) => {
			const [k, ...v] = a.slice(2).split("=");
			return [k, v.length ? v.join("=") : "true"];
		}),
);

const BASE = (args.url || "https://hgz-portfolio.harshitghosh.workers.dev").replace(/\/$/, "");

const PAGES = [
	"/",
	"/about/",
	"/projects/",
	"/projects/variantagent/",
	"/projects/covalentagent/",
	"/projects/constella/",
	"/projects/clinic-ops-copilot/",
	"/contact/",
	"/blog/",
	"/blog/variantagent-rule-engine/",
	"/blog/covalentagent-composition/",
	"/blog/constella-code-switching/",
	"/blog/clinicops-guardrails/",
];

function colorForImpact(impact) {
	return {
		critical: "\x1b[41m\x1b[97m",
		serious: "\x1b[31m",
		moderate: "\x1b[33m",
		minor: "\x1b[36m",
	}[impact] ?? "";
}

async function auditPage(browser, path) {
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 900 });
	await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 30000 });
	const results = await new AxePuppeteer(page).analyze();
	await page.close();
	return results;
}

async function main() {
	console.log(`Running axe-core on ${BASE}`);
	const browser = await puppeteer.launch({ headless: true });

	let totalViolations = 0;
	const allIssues = [];

	for (const path of PAGES) {
		process.stdout.write(`  ${path.padEnd(40)} `);
		try {
			const results = await auditPage(browser, path);
			const violations = results.violations;
			totalViolations += violations.length;
			if (violations.length === 0) {
				console.log("\x1b[32m✓ clean\x1b[0m");
			} else {
				console.log(`\x1b[33m${violations.length} issue(s)\x1b[0m`);
				for (const v of violations) {
					const color = colorForImpact(v.impact);
					console.log(`    ${color}${v.impact}\x1b[0m [${v.id}] ${v.help}`);
					for (const n of v.nodes.slice(0, 2)) {
						console.log(`      target: ${n.target.join(" ")}`);
						if (n.failureSummary) {
							console.log(`      ${n.failureSummary.split("\n")[1]?.trim() ?? ""}`);
						}
					}
					if (v.nodes.length > 2) {
						console.log(`      (+${v.nodes.length - 2} more)`);
					}
					allIssues.push({ path, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length });
				}
			}
		} catch (e) {
			console.log(`\x1b[31mERR\x1b[0m ${e.message}`);
		}
	}

	await browser.close();

	console.log("\n==================================================");
	console.log("  Summary");
	console.log("==================================================");
	console.log(`  Pages audited: ${PAGES.length}`);
	console.log(`  Total violations: ${totalViolations}`);
	if (allIssues.length > 0) {
		const byImpact = allIssues.reduce((acc, i) => {
			acc[i.impact] = (acc[i.impact] || 0) + 1;
			return acc;
		}, {});
		for (const [impact, n] of Object.entries(byImpact)) {
			console.log(`    ${impact}: ${n}`);
		}
	}
	console.log("");

	process.exit(totalViolations > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("FAIL:", e);
	process.exit(2);
});
