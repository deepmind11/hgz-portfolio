/**
 * Shared shell component for live project demos.
 *
 * Wraps project-specific input + result renderers with:
 *  - A "Run" button with loading state
 *  - Rate-limit-aware error display
 *  - "Copy as JSON" and "Run again" affordances
 *  - Metadata footer (latency, cache status, model version)
 *
 * Usage:
 *   <DemoRunner
 *     project="variantagent"
 *     endpoint="/api/demo/variantagent"
 *     title="Try VariantAgent"
 *     description="Paste a variant and get an ACMG classification."
 *     inputComponent={VariantAgentInputForm}
 *     resultComponent={VariantAgentResultView}
 *     initialInput={{ variant: "17:43045712:A:G" }}
 *   />
 */

import { useState, type ComponentType } from "react";
import type { DemoError, DemoProject, DemoResponse } from "../../lib/demos/schema";

export interface DemoRunnerProps<I, R> {
	project: DemoProject;
	endpoint: string;
	title: string;
	description: string;
	inputComponent: ComponentType<{
		input: I;
		onChange: (next: I) => void;
		onSubmit: () => void;
		disabled: boolean;
	}>;
	resultComponent: ComponentType<{ result: R }>;
	initialInput: I;
}

export default function DemoRunner<I, R>({
	project,
	endpoint,
	title,
	description,
	inputComponent: InputComponent,
	resultComponent: ResultComponent,
	initialInput,
}: DemoRunnerProps<I, R>) {
	const [input, setInput] = useState<I>(initialInput);
	const [loading, setLoading] = useState(false);
	const [response, setResponse] = useState<DemoResponse<R> | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [notImplemented, setNotImplemented] = useState(false);

	async function run() {
		if (loading) return;
		setLoading(true);
		setError(null);
		setResponse(null);
		setNotImplemented(false);

		try {
			const res = await fetch(endpoint, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ input }),
			});

			if (res.status === 501) {
				const body = (await res.json().catch(() => ({}))) as DemoError;
				setNotImplemented(true);
				setError(body.error ?? "This demo isn't available yet.");
				return;
			}

			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error ?? `HTTP ${res.status}`);
			}

			const json = (await res.json()) as DemoResponse<R>;
			setResponse(json);
		} catch (e) {
			setError((e as Error).message ?? "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	return (
		<section className="demo-runner">
			<header className="demo-header">
				<div>
					<h3 className="demo-title">{title}</h3>
					<p className="demo-description">{description}</p>
				</div>
				<span className="demo-badge">live</span>
			</header>

			<div className="demo-input-area">
				<InputComponent
					input={input}
					onChange={setInput}
					onSubmit={run}
					disabled={loading}
				/>
				<button
					type="button"
					onClick={run}
					disabled={loading}
					className="demo-run-btn"
					aria-label="Run the demo"
				>
					{loading ? (
						<>
							<span className="demo-spinner" aria-hidden="true" />
							<span>Running…</span>
						</>
					) : (
						"Run demo"
					)}
				</button>
			</div>

			{error && (
				<div className={`demo-error ${notImplemented ? "demo-error-soft" : ""}`}>
					<strong>{notImplemented ? "Not yet wired up." : "Error."}</strong> {error}
				</div>
			)}

			{response && (
				<div className="demo-result">
					<ResultComponent result={response.result} />
					<footer className="demo-meta">
						<span>{response.metadata.cached ? "cached" : "fresh"}</span>
						<span>·</span>
						<span>{response.metadata.durationMs} ms</span>
						{response.metadata.modelVersion && (
							<>
								<span>·</span>
								<span>{response.metadata.modelVersion}</span>
							</>
						)}
						<span>·</span>
						<button
							type="button"
							className="demo-meta-btn"
							onClick={() => {
								navigator.clipboard
									?.writeText(JSON.stringify(response, null, 2))
									.catch(() => {});
							}}
						>
							copy as JSON
						</button>
					</footer>
				</div>
			)}
		</section>
	);
}
