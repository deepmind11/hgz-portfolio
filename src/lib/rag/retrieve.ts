/**
 * Query Vectorize for the top-K most similar chunks for a given query embedding.
 * Returns chunk text + metadata for prompt assembly.
 */

export interface RetrievedChunk {
	id: string;
	score: number;
	title: string;
	text: string;
	source: string;
	kind: "rag" | "project";
	slug?: string;
}

export async function retrieve(
	vectorize: VectorizeIndex,
	queryVector: number[],
	topK = 5,
): Promise<RetrievedChunk[]> {
	const result = await vectorize.query(queryVector, {
		topK,
		returnValues: false,
		returnMetadata: "all",
	});

	return result.matches.map((m) => {
		const meta = (m.metadata ?? {}) as Record<string, unknown>;
		return {
			id: String(m.id),
			score: m.score,
			title: String(meta.title ?? "Untitled"),
			text: String(meta.text ?? ""),
			source: String(meta.source ?? ""),
			kind: (meta.kind as "rag" | "project") ?? "rag",
			slug: meta.slug ? String(meta.slug) : undefined,
		};
	});
}
