/**
 * Constella demo — language span detection.
 *
 * The real Constella uses Microsoft VibeVoice to synthesize
 * English+Spanish code-switched speech in a single voice
 * constellation. For the browser demo we do the interesting part
 * server-side (detect where each span changes language) and let the
 * browser's Web Speech API synthesize the audio with per-span voice
 * selection. This avoids needing a Python GPU backend while still
 * demonstrating the "voice constellation" concept.
 *
 * This is a simplified reimplementation. The full pipeline
 * (github.com/deepmind11/constella) trains voice embeddings and uses
 * VibeVoice for inference.
 */

import type { ConstellaInput, ConstellaResult } from "./schema";

// Strong Spanish cue words — high signal for code-switch detection.
// Kept small and specific to avoid false positives on English cognates.
const SPANISH_CUES = new Set([
	// Function words
	"el", "la", "los", "las", "un", "una", "unos", "unas",
	"de", "del", "en", "por", "para", "con", "sin",
	"y", "o", "pero", "porque", "que", "qué", "cuando", "cuándo",
	"donde", "dónde", "como", "cómo", "cuál", "cuáles",
	// Pronouns
	"yo", "tú", "él", "ella", "nosotros", "vosotros", "ellos", "ellas",
	"me", "te", "se", "nos", "os", "le", "les",
	"esto", "eso", "aquello", "este", "ese", "aquel",
	// Common verbs (es/ar/ir endings)
	"es", "son", "soy", "eres", "fue", "fueron",
	"está", "están", "estoy", "estás", "estar", "ser",
	"tengo", "tienes", "tiene", "tenemos", "tienen",
	"voy", "vas", "va", "vamos", "vais", "van", "ir",
	"hago", "haces", "hace", "hacemos", "hacen",
	"digo", "dices", "dice", "decimos", "dicen",
	"puedo", "puedes", "puede", "podemos", "pueden",
	// Common words
	"sí", "no", "muy", "más", "menos", "bien", "mal",
	"ahora", "ayer", "hoy", "mañana", "aquí", "ahí", "allí",
	"gracias", "hola", "adiós", "bueno", "vale",
	"primero", "segundo", "tercero",
	// Common code-switch triggers
	"entonces", "seguir", "seguro", "igual", "vale",
	"quedé", "testeamos", "coffee",  // joke inclusion; last word stays EN
]);

// Spanish-distinctive characters. If a word contains these, it's almost
// certainly Spanish (or a name).
const SPANISH_CHARS = /[áéíóúüñ¿¡]/i;

// ============================================================
// Span detection
// ============================================================

export function detectSpans(text: string): Array<{ lang: "en" | "es"; text: string }> {
	// Tokenize while preserving whitespace/punctuation boundaries
	const tokens = text.match(/\S+|\s+/g) ?? [];
	if (tokens.length === 0) return [];

	const spans: Array<{ lang: "en" | "es"; text: string }> = [];
	let currentLang: "en" | "es" = "en";
	let currentText = "";

	function classify(word: string): "en" | "es" | "neutral" {
		const trimmed = word.toLowerCase().replace(/[^a-záéíóúüñ¿¡]/gi, "");
		if (!trimmed) return "neutral";
		if (SPANISH_CHARS.test(trimmed)) return "es";
		if (SPANISH_CUES.has(trimmed)) return "es";
		return "en";
	}

	for (const tok of tokens) {
		if (/^\s+$/.test(tok)) {
			currentText += tok;
			continue;
		}
		const lang = classify(tok);
		if (lang === "neutral") {
			currentText += tok;
			continue;
		}
		if (lang !== currentLang && currentText.trim().length > 0) {
			spans.push({ lang: currentLang, text: currentText.trim() });
			currentText = "";
		}
		currentLang = lang;
		currentText += (currentText && !currentText.endsWith(" ") ? " " : "") + tok;
	}
	if (currentText.trim().length > 0) {
		spans.push({ lang: currentLang, text: currentText.trim() });
	}

	// Merge adjacent spans of the same language
	const merged: Array<{ lang: "en" | "es"; text: string }> = [];
	for (const s of spans) {
		const last = merged[merged.length - 1];
		if (last && last.lang === s.lang) {
			last.text = `${last.text} ${s.text}`;
		} else {
			merged.push({ ...s });
		}
	}
	return merged;
}

export function runConstella(input: ConstellaInput): ConstellaResult {
	const text = input.text.trim();
	if (!text) throw new Error("text is required");
	if (text.length > 300) throw new Error("text too long (max 300 chars)");

	const spans = detectSpans(text);

	return {
		text,
		detected_spans: spans,
		// No pre-rendered audio — browser synthesizes via Web Speech API
		audio_url: undefined,
		audio_format: undefined,
		stubbed: false,
		disclaimer:
			"Demo only. Language-span detection runs on the edge; the browser synthesizes each span with its native Web Speech API voice (per-span language tags). The full Constella trains voice constellations with Microsoft VibeVoice — see GitHub for that pipeline.",
	};
}
