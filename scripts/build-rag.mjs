#!/usr/bin/env node
/**
 * RAG ingestion script: reads curated content, embeds it via Cloudflare Workers AI REST API,
 * writes vectors to ./rag-vectors.ndjson, then upserts to the Vectorize index.
 *
 * Usage:
 *   node scripts/build-rag.mjs              # build vectors only
 *   node scripts/build-rag.mjs --upload     # build vectors AND upload to Vectorize
 *
 * Required env vars (read from .env):
 *   CLOUDFLARE_ACCOUNT_ID    — Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN     — API token with Workers AI Read + Vectorize Edit
 *
 * Or, if CLOUDFLARE_API_TOKEN is not set, will use the wrangler OAuth token from
 * ~/Library/Preferences/.wrangler/config/default.toml on macOS.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const ACCOUNT_ID = "a7d9a96a7e0bf51fcaa964d91939d4f4";
const VECTORIZE_INDEX = "hgz-portfolio-rag";
const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";
const EMBED_DIM = 768;

const RAG_DIR = join(ROOT, "src/content/rag");
const PROJECTS_DIR = join(ROOT, "src/content/projects");
const OUT_FILE = join(ROOT, "rag-vectors.ndjson");

// ---------- auth ----------

function getAuthToken() {
	if (process.env.CLOUDFLARE_API_TOKEN) {
		return { type: "bearer", value: process.env.CLOUDFLARE_API_TOKEN };
	}
	const wranglerCfgPath = join(
		homedir(),
		"Library/Preferences/.wrangler/config/default.toml",
	);
	if (existsSync(wranglerCfgPath)) {
		const cfg = readFileSync(wranglerCfgPath, "utf8");
		const m = cfg.match(/oauth_token = "([^"]+)"/);
		if (m) return { type: "bearer", value: m[1] };
	}
	throw new Error(
		"No auth available. Set CLOUDFLARE_API_TOKEN or run `wrangler login`.",
	);
}

// ---------- content loading ----------

function stripFrontmatter(text) {
	if (text.startsWith("---")) {
		const end = text.indexOf("\n---", 3);
		if (end !== -1) return text.slice(end + 4).trim();
	}
	return text.trim();
}

function loadFrontmatter(text) {
	if (!text.startsWith("---")) return {};
	const end = text.indexOf("\n---", 3);
	if (end === -1) return {};
	const fm = text.slice(3, end);
	const out = {};
	for (const line of fm.split("\n")) {
		const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+)$/);
		if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
	}
	return out;
}

function extractTitle(text) {
	const m = text.match(/^#\s+(.+)$/m);
	return m ? m[1].trim() : "Untitled";
}

function loadDocs() {
	const docs = [];

	// Curated RAG markdown files
	for (const f of readdirSync(RAG_DIR).sort()) {
		if (!f.endsWith(".md")) continue;
		const text = stripFrontmatter(readFileSync(join(RAG_DIR, f), "utf8"));
		const title = extractTitle(text);
		const id = `rag-${basename(f, ".md")}`;
		docs.push({ id, source: `rag/${f}`, title, text, kind: "rag" });
	}

	// Project MDX files (re-use existing curated content)
	for (const f of readdirSync(PROJECTS_DIR).sort()) {
		if (!f.endsWith(".mdx")) continue;
		const raw = readFileSync(join(PROJECTS_DIR, f), "utf8");
		const fm = loadFrontmatter(raw);
		const body = stripFrontmatter(raw);
		const slug = fm.slug || basename(f, ".mdx");
		const title = fm.title || extractTitle(body);
		const tagline = fm.tagline || "";
		// Prepend title + tagline so retrieval surfaces context even on partial matches
		const text = `# ${title}\n\n${tagline ? `${tagline}\n\n` : ""}${body}`;
		docs.push({
			id: `project-${slug}`,
			source: `projects/${f}`,
			title,
			text,
			kind: "project",
			slug,
		});
	}

	return docs;
}

// ---------- chunking ----------

function chunkText(text, maxChars = 1400, overlapChars = 150) {
	if (text.length <= maxChars) return [text];
	const chunks = [];
	const paragraphs = text.split(/\n\n+/);
	let current = "";
	for (const p of paragraphs) {
		if ((current + "\n\n" + p).length > maxChars && current.length > 0) {
			chunks.push(current.trim());
			// overlap: keep tail of current as start of next
			const tail = current.slice(-overlapChars);
			current = tail + "\n\n" + p;
		} else {
			current = current ? current + "\n\n" + p : p;
		}
	}
	if (current.trim().length > 0) chunks.push(current.trim());
	return chunks;
}

function buildChunks(docs) {
	const chunks = [];
	for (const doc of docs) {
		const pieces = chunkText(doc.text);
		pieces.forEach((text, i) => {
			chunks.push({
				id: pieces.length === 1 ? doc.id : `${doc.id}-${i}`,
				doc_id: doc.id,
				source: doc.source,
				title: doc.title,
				kind: doc.kind,
				slug: doc.slug,
				chunk_index: i,
				chunk_count: pieces.length,
				text,
			});
		});
	}
	return chunks;
}

// ---------- embeddings ----------

async function embedBatch(texts, auth) {
	const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${EMBED_MODEL}`;
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${auth.value}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ text: texts }),
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Embed API ${res.status}: ${body}`);
	}
	const json = await res.json();
	if (!json.success) {
		throw new Error(`Embed API error: ${JSON.stringify(json.errors)}`);
	}
	return json.result.data;
}

async function embedAll(chunks, auth) {
	const BATCH = 10; // BGE accepts up to ~100 but smaller batches are gentler on rate limits
	const out = [];
	for (let i = 0; i < chunks.length; i += BATCH) {
		const batch = chunks.slice(i, i + BATCH);
		const texts = batch.map((c) => c.text);
		process.stdout.write(
			`  Embedding chunks ${i + 1}–${Math.min(i + BATCH, chunks.length)} of ${chunks.length}...\r`,
		);
		const vectors = await embedBatch(texts, auth);
		batch.forEach((c, j) => {
			if (vectors[j].length !== EMBED_DIM) {
				throw new Error(
					`Unexpected embed dim ${vectors[j].length} for ${c.id} (expected ${EMBED_DIM})`,
				);
			}
			out.push({ ...c, values: vectors[j] });
		});
	}
	process.stdout.write("\n");
	return out;
}

// ---------- output ----------

function writeNdjson(embedded) {
	const lines = embedded.map((c) =>
		JSON.stringify({
			id: c.id,
			values: c.values,
			metadata: {
				doc_id: c.doc_id,
				source: c.source,
				title: c.title,
				kind: c.kind,
				slug: c.slug || "",
				chunk_index: c.chunk_index,
				chunk_count: c.chunk_count,
				text: c.text,
			},
		}),
	);
	writeFileSync(OUT_FILE, lines.join("\n") + "\n");
}

// ---------- vectorize upsert ----------

async function upsertViaApi(embedded, auth) {
	const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`;
	const ndjson = embedded
		.map((c) =>
			JSON.stringify({
				id: c.id,
				values: c.values,
				metadata: {
					doc_id: c.doc_id,
					source: c.source,
					title: c.title,
					kind: c.kind,
					slug: c.slug || "",
					chunk_index: c.chunk_index,
					chunk_count: c.chunk_count,
					text: c.text,
				},
			}),
		)
		.join("\n");
	const res = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${auth.value}`,
			"Content-Type": "application/x-ndjson",
		},
		body: ndjson,
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Vectorize upsert ${res.status}: ${body}`);
	}
	const json = await res.json();
	if (!json.success) {
		throw new Error(`Vectorize upsert error: ${JSON.stringify(json.errors)}`);
	}
	return json.result;
}

// ---------- main ----------

async function main() {
	const upload = process.argv.includes("--upload");

	console.log("Loading docs...");
	const docs = loadDocs();
	console.log(`  ${docs.length} source docs found`);

	console.log("Chunking...");
	const chunks = buildChunks(docs);
	console.log(
		`  ${chunks.length} chunks (avg ${Math.round(chunks.reduce((a, c) => a + c.text.length, 0) / chunks.length)} chars)`,
	);

	const auth = getAuthToken();
	console.log(`Auth: ${auth.type} from ${process.env.CLOUDFLARE_API_TOKEN ? "env" : "wrangler"}`);

	console.log("Embedding...");
	const embedded = await embedAll(chunks, auth);
	console.log(`  ${embedded.length} vectors ready`);

	console.log(`Writing ${OUT_FILE}`);
	writeNdjson(embedded);

	if (upload) {
		console.log("Upserting to Vectorize...");
		const result = await upsertViaApi(embedded, auth);
		console.log(`  Mutation: ${JSON.stringify(result)}`);
	} else {
		console.log("Skipped upload (use --upload to push to Vectorize)");
	}

	console.log("Done.");
}

main().catch((e) => {
	console.error("FAIL:", e.message);
	process.exit(1);
});
