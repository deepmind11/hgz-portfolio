/**
 * Embed text via Cloudflare Workers AI BGE base.
 * Uses the platform binding (env.AI) — runs inside the Worker, not via REST.
 */

const EMBED_MODEL = "@cf/baai/bge-base-en-v1.5";

export async function embed(ai: Ai, text: string): Promise<number[]> {
	const result = (await ai.run(EMBED_MODEL, { text: [text] })) as {
		shape: number[];
		data: number[][];
	};
	if (!result?.data?.[0]) {
		throw new Error("Embedding failed: empty response from Workers AI");
	}
	return result.data[0];
}
