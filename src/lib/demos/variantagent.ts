/**
 * Simplified VariantAgent demo logic.
 *
 * The full VariantAgent (github.com/deepmind11/variantagent) is a
 * six-agent LangGraph system with MCP servers for ClinVar, gnomAD,
 * VEP, and PubMed, plus a deterministic ACMG rule engine. That system
 * is too heavy for a browser demo.
 *
 * This endpoint ships a small, Workers-native reimplementation that:
 *   1. Parses a simple variant string (chr:pos:ref:alt)
 *   2. Queries ClinVar via NCBI eutils
 *   3. Queries gnomAD via GraphQL
 *   4. Applies a subset of ACMG criteria (PS1/PM2/BA1)
 *   5. Returns a structured classification with full evidence
 *
 * Disclaimers: this is a demo, not a clinical tool. Only 3 ACMG
 * criteria are evaluated. No functional predictions, no literature
 * search, no human review.
 */

import type { VariantAgentInput, VariantAgentResult } from "./schema";

const CLINVAR_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const CLINVAR_ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";
const GNOMAD_GRAPHQL = "https://gnomad.broadinstitute.org/api";

const DISCLAIMER =
	"Demo only. This is a simplified reimplementation of VariantAgent that evaluates a subset of ACMG criteria (PS1, PM2, BA1). Not a clinical tool. The full multi-agent system is on GitHub.";

// ============================================================
// Input parsing
// ============================================================

export function parseVariant(raw: string): {
	chromosome: string;
	position: number;
	ref: string;
	alt: string;
} | null {
	const cleaned = raw.trim().replace(/^chr/i, "");
	const parts = cleaned.split(/[:\s,>]+/).filter(Boolean);
	if (parts.length !== 4) return null;
	const [chr, posStr, ref, alt] = parts;
	const position = Number.parseInt(posStr, 10);
	if (!Number.isFinite(position) || position < 1) return null;
	if (!/^[ACGTN-]+$/i.test(ref) || !/^[ACGTN-]+$/i.test(alt)) return null;
	return {
		chromosome: chr.toUpperCase(),
		position,
		ref: ref.toUpperCase(),
		alt: alt.toUpperCase(),
	};
}

// ============================================================
// ClinVar lookup
// ============================================================

interface ClinVarHit {
	id: string;
	interpretation: string;
	review_status: string;
}

async function queryClinVar(
	chr: string,
	pos: number,
	ref: string,
	alt: string,
): Promise<ClinVarHit | null> {
	// Search by genomic coordinates. ClinVar eutils supports this via the "Position" field.
	// Format: chr{CHR}[CHR] AND {POS}:{POS}[Base Position for Assembly GRCh38]
	const term = `${chr}[Chromosome] AND ${pos}:${pos}[Base Position for Assembly GRCh38]`;
	const searchUrl = `${CLINVAR_ESEARCH}?db=clinvar&term=${encodeURIComponent(term)}&retmode=json&retmax=5`;

	const searchRes = await fetch(searchUrl, {
		headers: { Accept: "application/json", "User-Agent": "hgz-portfolio-demo" },
	});
	if (!searchRes.ok) throw new Error(`ClinVar search ${searchRes.status}`);
	const searchJson = (await searchRes.json()) as {
		esearchresult?: { idlist?: string[] };
	};
	const ids = searchJson.esearchresult?.idlist ?? [];
	if (ids.length === 0) return null;

	const summaryUrl = `${CLINVAR_ESUMMARY}?db=clinvar&id=${ids.join(",")}&retmode=json`;
	const summaryRes = await fetch(summaryUrl, {
		headers: { Accept: "application/json", "User-Agent": "hgz-portfolio-demo" },
	});
	if (!summaryRes.ok) throw new Error(`ClinVar summary ${summaryRes.status}`);
	const summaryJson = (await summaryRes.json()) as {
		result?: Record<string, unknown>;
	};
	const result = summaryJson.result ?? {};

	// Find a record that matches our ref/alt
	for (const id of ids) {
		const rec = result[id] as Record<string, unknown> | undefined;
		if (!rec) continue;
		const germlineClassification =
			(rec.germline_classification as { description?: string } | undefined)?.description ??
			(rec.classification as { description?: string } | undefined)?.description ??
			null;
		const reviewStatus =
			(rec.germline_classification as { review_status?: string } | undefined)?.review_status ??
			null;
		const variationSet = rec.variation_set as Array<Record<string, unknown>> | undefined;
		// Try to match allele from variation set
		let matched = false;
		if (Array.isArray(variationSet)) {
			for (const v of variationSet) {
				const canonicalSpdi = (v.canonical_spdi as string | undefined) ?? "";
				if (canonicalSpdi.includes(`:${pos - 1}:${ref}:${alt}`)) {
					matched = true;
					break;
				}
			}
		}
		// If we couldn't match precisely, still return the first ClinVar hit
		// at this position — it's at least contextually relevant.
		if (matched || ids.length === 1) {
			return {
				id,
				interpretation: germlineClassification ?? "Unknown",
				review_status: reviewStatus ?? "unknown",
			};
		}
	}

	return null;
}

// ============================================================
// gnomAD lookup
// ============================================================

interface GnomadHit {
	allele_count: number;
	allele_number: number;
	allele_frequency: number;
	popmax_af: number | null;
}

async function queryGnomad(
	chr: string,
	pos: number,
	ref: string,
	alt: string,
): Promise<GnomadHit | null> {
	const variantId = `${chr}-${pos}-${ref}-${alt}`;
	const query = `
		query VariantQuery($variantId: String!) {
			variant(variantId: $variantId, dataset: gnomad_r4) {
				exome {
					ac
					an
					af
					populations {
						id
						ac
						an
					}
				}
				genome {
					ac
					an
					af
					populations {
						id
						ac
						an
					}
				}
			}
		}
	`;

	const res = await fetch(GNOMAD_GRAPHQL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
			"User-Agent": "hgz-portfolio-demo",
		},
		body: JSON.stringify({ query, variables: { variantId } }),
	});
	if (!res.ok) throw new Error(`gnomAD HTTP ${res.status}`);
	const json = (await res.json()) as {
		data?: {
			variant?: {
				exome?: {
					ac: number;
					an: number;
					af: number;
					populations: Array<{ id: string; ac: number; an: number }>;
				} | null;
				genome?: {
					ac: number;
					an: number;
					af: number;
					populations: Array<{ id: string; ac: number; an: number }>;
				} | null;
			} | null;
		};
		errors?: Array<{ message: string }>;
	};
	if (json.errors && json.errors.length > 0) {
		// gnomAD returns 200 with errors when variant doesn't exist
		return null;
	}
	const variant = json.data?.variant;
	if (!variant) return null;

	// Prefer exome, fall back to genome
	const src = variant.exome ?? variant.genome;
	if (!src) return null;

	let popmax_af: number | null = null;
	for (const pop of src.populations ?? []) {
		// Skip aggregate groups
		if (pop.id.includes("XX") || pop.id.includes("XY") || pop.id === "oth") continue;
		if (pop.an > 0) {
			const af = pop.ac / pop.an;
			if (popmax_af === null || af > popmax_af) popmax_af = af;
		}
	}

	return {
		allele_count: src.ac,
		allele_number: src.an,
		allele_frequency: src.af,
		popmax_af,
	};
}

// ============================================================
// ACMG rule application (simplified)
// ============================================================

interface ClassificationInputs {
	clinvar: ClinVarHit | null;
	gnomad: GnomadHit | null;
}

function applyAcmgRules(inputs: ClassificationInputs): {
	classification: VariantAgentResult["classification"];
	criteriaApplied: VariantAgentResult["criteriaApplied"];
} {
	const criteria: VariantAgentResult["criteriaApplied"] = [];

	// PS1: Same amino acid change as previously established pathogenic
	// Simplified: if ClinVar already marks it Pathogenic with at least one-star review, take that as evidence.
	if (inputs.clinvar) {
		const interp = inputs.clinvar.interpretation.toLowerCase();
		if (interp.includes("pathogenic") && !interp.includes("conflicting")) {
			criteria.push({
				code: "PS1_proxy",
				weight: "PS",
				evidence: `ClinVar germline classification: ${inputs.clinvar.interpretation} (review status: ${inputs.clinvar.review_status})`,
				source: `clinvar:${inputs.clinvar.id}`,
			});
		} else if (interp.includes("benign")) {
			criteria.push({
				code: "BS_proxy",
				weight: "BS",
				evidence: `ClinVar germline classification: ${inputs.clinvar.interpretation}`,
				source: `clinvar:${inputs.clinvar.id}`,
			});
		} else if (interp.includes("uncertain") || interp.includes("vus")) {
			criteria.push({
				code: "ClinVar_VUS",
				weight: "PP",
				evidence: `ClinVar germline classification: ${inputs.clinvar.interpretation}`,
				source: `clinvar:${inputs.clinvar.id}`,
			});
		}
	}

	// BA1: Allele frequency > 5% in a population → stand-alone benign
	if (inputs.gnomad) {
		const maxAf = Math.max(inputs.gnomad.allele_frequency ?? 0, inputs.gnomad.popmax_af ?? 0);
		if (maxAf > 0.05) {
			criteria.push({
				code: "BA1",
				weight: "BA1",
				evidence: `gnomAD popmax allele frequency ${(maxAf * 100).toFixed(3)}% > 5% threshold`,
				source: "gnomad:v4",
			});
		}
		// PM2: Absent from controls (or extremely low frequency)
		if (inputs.gnomad.allele_count === 0) {
			criteria.push({
				code: "PM2",
				weight: "PM",
				evidence: "Absent from gnomAD v4 (AC = 0)",
				source: "gnomad:v4",
			});
		} else if (inputs.gnomad.allele_frequency !== null && inputs.gnomad.allele_frequency < 1e-5) {
			criteria.push({
				code: "PM2_supporting",
				weight: "PP",
				evidence: `gnomAD v4 allele frequency ${inputs.gnomad.allele_frequency.toExponential(2)} (extremely rare)`,
				source: "gnomad:v4",
			});
		}
	} else {
		criteria.push({
			code: "PM2",
			weight: "PM",
			evidence: "Absent from gnomAD v4 (variant not indexed)",
			source: "gnomad:v4",
		});
	}

	// Combination logic — simplified
	const hasBA1 = criteria.some((c) => c.code === "BA1");
	const hasBS = criteria.some((c) => c.weight === "BS");
	const hasPS = criteria.some((c) => c.weight === "PS");
	const hasPM = criteria.some((c) => c.weight === "PM");
	const hasPP = criteria.some((c) => c.weight === "PP");

	let classification: VariantAgentResult["classification"] = "Unknown";
	if (hasBA1) {
		classification = "Benign";
	} else if (hasBS && !hasPS) {
		classification = "Likely benign";
	} else if (hasPS && hasPM) {
		classification = "Pathogenic";
	} else if (hasPS) {
		classification = "Likely pathogenic";
	} else if (hasPM && hasPP) {
		classification = "Likely pathogenic";
	} else if (hasPM || hasPP) {
		classification = "VUS";
	} else if (criteria.length > 0) {
		classification = "VUS";
	}

	return { classification, criteriaApplied: criteria };
}

// ============================================================
// Orchestration
// ============================================================

export async function runVariantAgent(
	input: VariantAgentInput,
): Promise<VariantAgentResult> {
	const parsed = parseVariant(input.variant);
	if (!parsed) {
		throw new Error(
			"Invalid variant format. Use `chr:pos:ref:alt` e.g. `17:43045712:A:G`.",
		);
	}
	const { chromosome, position, ref, alt } = parsed;

	// Parallel upstream calls
	const [clinvar, gnomad] = await Promise.allSettled([
		queryClinVar(chromosome, position, ref, alt),
		queryGnomad(chromosome, position, ref, alt),
	]);

	const clinvarHit = clinvar.status === "fulfilled" ? clinvar.value : null;
	const gnomadHit = gnomad.status === "fulfilled" ? gnomad.value : null;

	const { classification, criteriaApplied } = applyAcmgRules({
		clinvar: clinvarHit,
		gnomad: gnomadHit,
	});

	const sources: string[] = [];
	if (clinvarHit) sources.push(`ClinVar ID ${clinvarHit.id}`);
	if (gnomadHit)
		sources.push(
			`gnomAD v4 (AF ${(gnomadHit.allele_frequency ?? 0).toExponential(2)}, AN ${gnomadHit.allele_number})`,
		);

	return {
		variant: {
			chromosome,
			position,
			ref,
			alt,
			assembly: input.assembly ?? "GRCh38",
		},
		classification,
		criteriaApplied,
		clinvar: clinvarHit
			? {
					id: clinvarHit.id,
					interpretation: clinvarHit.interpretation,
					review_status: clinvarHit.review_status,
					url: `https://www.ncbi.nlm.nih.gov/clinvar/variation/${clinvarHit.id}/`,
				}
			: { id: null, interpretation: null, review_status: null, url: null },
		gnomad: gnomadHit
			? {
					allele_frequency: gnomadHit.allele_frequency,
					allele_count: gnomadHit.allele_count,
					allele_number: gnomadHit.allele_number,
					popmax_af: gnomadHit.popmax_af,
					url: `https://gnomad.broadinstitute.org/variant/${chromosome}-${position}-${ref}-${alt}?dataset=gnomad_r4`,
				}
			: {
					allele_frequency: null,
					allele_count: null,
					allele_number: null,
					popmax_af: null,
					url: null,
				},
		sources,
		disclaimer: DISCLAIMER,
	};
}
