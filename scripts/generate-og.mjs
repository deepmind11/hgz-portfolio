#!/usr/bin/env node
/**
 * Generate Open Graph PNG images for every public page on the site.
 *
 * Uses satori (JSX → SVG) + @resvg/resvg-js (SVG → PNG).
 * Outputs land in public/og/*.png and are referenced via BaseLayout
 * when a page declares ogImage.
 *
 * Run:
 *   npm run og
 *
 * To add a new page, append an entry to PAGES below and re-run.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public/og");

// ============================================================
// Pages
// ============================================================

const PAGES = [
	{
		file: "og-default.png",
		kind: "home",
		badge: "Portfolio",
		title: "Harshit Ghosh",
		subtitle: "Building at the intersection of biology and AI.",
	},
	{
		file: "og-about.png",
		kind: "about",
		badge: "About",
		title: "Harshit Ghosh",
		subtitle: "Deep learning for biology. Agentic systems with LLMs and biology foundation models.",
	},
	{
		file: "og-projects.png",
		kind: "projects",
		badge: "Projects",
		title: "Four live open-source projects",
		subtitle: "Multi-agent AI for genomics, drug discovery, and clinical operations.",
	},
	{
		file: "og-variantagent.png",
		kind: "project",
		badge: "Project",
		title: "VariantAgent",
		subtitle: "Multi-agent ACMG variant interpretation with full provenance.",
	},
	{
		file: "og-covalentagent.png",
		kind: "project",
		badge: "Project",
		title: "CovalentAgent",
		subtitle: "Multi-agent system for covalent drug design on protein targets.",
	},
	{
		file: "og-constella.png",
		kind: "project",
		badge: "Project",
		title: "Constella",
		subtitle: "English-Spanish code-switched voice synthesis.",
	},
	{
		file: "og-clinic-ops-copilot.png",
		kind: "project",
		badge: "Project",
		title: "ClinicOps Copilot",
		subtitle: "Natural-language query agent for clinical operations.",
	},
];

// ============================================================
// Fonts — loaded from .og-fonts/ (TTF only, committed locally
// via scripts/fetch-og-fonts.sh)
// ============================================================

const FONT_DIR = join(ROOT, ".og-fonts");

function loadFont(name) {
	const path = join(FONT_DIR, name);
	if (!existsSync(path)) {
		throw new Error(
			`Missing font ${path}. Run ./scripts/fetch-og-fonts.sh to download.`,
		);
	}
	return readFileSync(path);
}

// ============================================================
// Template
// ============================================================

function template({ badge, title, subtitle }) {
	const bg = "#0a0a0f"; // matches --color-bg (oklch 0.09 0.005 250)
	const fg = "#f5f5f6"; // matches --color-fg
	const muted = "#a5a5ae"; // matches --color-fg-muted
	const accent = "#36d399"; // matches --color-accent (emerald)

	return {
		type: "div",
		props: {
			style: {
				width: "1200px",
				height: "630px",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "72px 80px",
				backgroundColor: bg,
				// Subtle grid background as radial dots
				backgroundImage:
					"radial-gradient(circle, #1a1a24 1px, transparent 1px)",
				backgroundSize: "24px 24px",
				fontFamily: "Inter",
				color: fg,
			},
			children: [
				// Top bar — logo + badge
				{
					type: "div",
					props: {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
						},
						children: [
							{
								type: "div",
								props: {
									style: {
										display: "flex",
										alignItems: "center",
										gap: "16px",
									},
									children: [
										{
											type: "div",
											props: {
												style: {
													display: "flex",
													alignItems: "center",
													justifyContent: "center",
													width: "48px",
													height: "48px",
													backgroundColor: accent,
													color: bg,
													borderRadius: "8px",
													fontSize: "22px",
													fontWeight: 700,
													letterSpacing: "-0.02em",
												},
												children: "hg",
											},
										},
										{
											type: "div",
											props: {
												style: {
													fontSize: "22px",
													fontWeight: 600,
													color: fg,
												},
												children: "Harshit Ghosh",
											},
										},
									],
								},
							},
							{
								type: "div",
								props: {
									style: {
										display: "flex",
										alignItems: "center",
										gap: "8px",
										padding: "10px 18px",
										border: `1px solid ${accent}55`,
										borderRadius: "999px",
										fontSize: "18px",
										fontWeight: 600,
										color: accent,
										textTransform: "uppercase",
										letterSpacing: "0.08em",
									},
									children: [
										{
											type: "div",
											props: {
												style: {
													width: "10px",
													height: "10px",
													borderRadius: "50%",
													backgroundColor: accent,
												},
												children: "",
											},
										},
										{
											type: "span",
											props: { children: badge },
										},
									],
								},
							},
						],
					},
				},
				// Title block
				{
					type: "div",
					props: {
						style: {
							display: "flex",
							flexDirection: "column",
							gap: "24px",
						},
						children: [
							{
								type: "div",
								props: {
									style: {
										fontSize: "78px",
										fontWeight: 700,
										color: fg,
										lineHeight: 1.05,
										letterSpacing: "-0.03em",
									},
									children: title,
								},
							},
							{
								type: "div",
								props: {
									style: {
										fontSize: "32px",
										color: muted,
										lineHeight: 1.4,
										maxWidth: "920px",
									},
									children: subtitle,
								},
							},
						],
					},
				},
				// Footer URL
				{
					type: "div",
					props: {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							fontSize: "22px",
							color: muted,
							fontFamily: "JetBrains Mono",
						},
						children: [
							{
								type: "span",
								props: { children: "hgz-portfolio.harshitghosh.workers.dev" },
							},
							{
								type: "span",
								props: {
									style: { color: accent },
									children: "→",
								},
							},
						],
					},
				},
			],
		},
	};
}

// ============================================================
// Render
// ============================================================

async function render(page, fonts) {
	const svg = await satori(template(page), {
		width: 1200,
		height: 630,
		fonts,
	});
	const resvg = new Resvg(svg, {
		fitTo: { mode: "width", value: 1200 },
	});
	return resvg.render().asPng();
}

async function main() {
	if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

	console.log("Loading fonts from .og-fonts/");
	const interRegular = loadFont("Inter-Regular.ttf");
	const interBold = loadFont("Inter-Bold.ttf");
	const jetbrains = loadFont("JetBrainsMono-Regular.ttf");

	const fonts = [
		{ name: "Inter", data: interRegular, weight: 400, style: "normal" },
		{ name: "Inter", data: interBold, weight: 700, style: "normal" },
		{ name: "JetBrains Mono", data: jetbrains, weight: 400, style: "normal" },
	];

	console.log(`Rendering ${PAGES.length} OG images...`);
	for (const page of PAGES) {
		process.stdout.write(`  ${page.file.padEnd(32)} `);
		const png = await render(page, fonts);
		writeFileSync(join(OUT_DIR, page.file), png);
		process.stdout.write(`${Math.round(png.length / 1024)} KB\n`);
	}
	console.log(`\nDone. Images written to ${OUT_DIR}`);
}

main().catch((e) => {
	console.error("FAIL:", e);
	process.exit(1);
});
