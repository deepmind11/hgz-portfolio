#!/usr/bin/env node
/**
 * Quick smoke test: embed a query, hit Vectorize, print top matches.
 * Usage: node scripts/test-rag.mjs "what does Harshit do"
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ACCOUNT_ID = "a7d9a96a7e0bf51fcaa964d91939d4f4";
const VECTORIZE_INDEX = "hgz-portfolio-rag";
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

function getToken() {
	if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
	const path = join(homedir(), "Library/Preferences/.wrangler/config/default.toml");
	if (existsSync(path)) {
		const m = readFileSync(path, "utf8").match(/oauth_token = "([^"]+)"/);
		if (m) return m[1];
	}
	throw new Error("No auth");
}

async function main() {
	const query = process.argv.slice(2).join(" ") || "what is Harshit's experience with AI";
	const token = getToken();

	const embedRes = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${EMBED_MODEL}`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({ text: [query] }),
		},
	);
	const embedJson = await embedRes.json();
	if (!embedJson.success) throw new Error(JSON.stringify(embedJson.errors));
	const queryVector = embedJson.result.data[0];

	const queryRes = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/query`,
		{
			method: "POST",
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
			body: JSON.stringify({
				vector: queryVector,
				topK: 5,
				returnValues: false,
				returnMetadata: "all",
			}),
		},
	);
	const queryJson = await queryRes.json();
	if (!queryJson.success) throw new Error(JSON.stringify(queryJson.errors));

	console.log(`Query: "${query}"\n`);
	console.log("Raw result:", JSON.stringify(queryJson.result).slice(0, 500));
	console.log("Match count:", queryJson.result.matches?.length || 0, "\n");
	(queryJson.result.matches || []).forEach((m, i) => {
		console.log(`${i + 1}. ${m.metadata.title}  [score=${m.score.toFixed(4)}, id=${m.id}]`);
		console.log(`   ${m.metadata.text.slice(0, 200).replace(/\n/g, " ")}...\n`);
	});
}

main().catch((e) => {
	console.error("FAIL:", e.message);
	process.exit(1);
});
