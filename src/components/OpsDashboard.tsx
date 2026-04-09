/**
 * Live observability dashboard. Fetches /api/ops and renders aggregate
 * stats for the chatbot + recent questions. Auto-refreshes every 60s.
 */

import { useEffect, useState } from "react";

interface OpsPayload {
	generated_at: string;
	chatbot: {
		total_messages: number;
		unique_sessions: number;
		messages_last_24h: number;
		messages_last_7d: number;
		assistant_messages: number;
		prompt_tokens_total: number;
		completion_tokens_total: number;
		estimated_cost_usd: number;
		latency_p50_ms: number | null;
		latency_p95_ms: number | null;
		sample_size: number;
	};
	recent_questions: Array<{ text: string; ago: string }>;
}

function fmtNum(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

export default function OpsDashboard() {
	const [data, setData] = useState<OpsPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	async function load() {
		try {
			const res = await fetch("/api/ops");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as OpsPayload;
			setData(json);
			setError(null);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
		const interval = setInterval(load, 60_000);
		return () => clearInterval(interval);
	}, []);

	if (loading && !data) {
		return (
			<div className="ops-loading">
				<span className="demo-spinner" />
				<span>Loading stats…</span>
			</div>
		);
	}

	if (error && !data) {
		return <div className="demo-error">Failed to load ops data: {error}</div>;
	}

	if (!data) return null;

	const c = data.chatbot;
	const lastUpdate = new Date(data.generated_at).toLocaleTimeString();

	return (
		<div className="ops-root">
			<div className="ops-grid">
				<Stat label="Total messages" value={fmtNum(c.total_messages)} sub={`${fmtNum(c.unique_sessions)} unique sessions`} />
				<Stat label="Last 24h" value={fmtNum(c.messages_last_24h)} sub="messages" />
				<Stat label="Last 7d" value={fmtNum(c.messages_last_7d)} sub="messages" />
				<Stat
					label="Estimated spend"
					value={`$${c.estimated_cost_usd.toFixed(4)}`}
					sub={`${fmtNum(c.prompt_tokens_total)} in / ${fmtNum(c.completion_tokens_total)} out tokens`}
				/>
				<Stat
					label="Latency p50"
					value={c.latency_p50_ms != null ? `${c.latency_p50_ms} ms` : "—"}
					sub={`sample ${c.sample_size}`}
				/>
				<Stat
					label="Latency p95"
					value={c.latency_p95_ms != null ? `${c.latency_p95_ms} ms` : "—"}
					sub={`assistant messages only`}
				/>
			</div>

			<div className="ops-section">
				<h2>Recent questions</h2>
				{data.recent_questions.length === 0 ? (
					<p className="ops-empty">No questions yet.</p>
				) : (
					<ul className="ops-questions">
						{data.recent_questions.map((q, i) => (
							<li key={i}>
								<span className="ops-question-text">{q.text}</span>
								<span className="ops-question-ago">{q.ago}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			<footer className="ops-footer">
				Updated {lastUpdate}. Refreshes every 60s.
			</footer>
		</div>
	);
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
	return (
		<div className="ops-stat">
			<div className="ops-stat-label">{label}</div>
			<div className="ops-stat-value">{value}</div>
			<div className="ops-stat-sub">{sub}</div>
		</div>
	);
}
