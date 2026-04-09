import DemoRunner from "./DemoRunner";
import type { ClinicOpsInput, ClinicOpsResult } from "../../lib/demos/schema";

const EXAMPLES = [
	"How many samples are stuck in QC right now?",
	"Show me all samples that failed in the last two weeks",
	"Which patients have Liquid Biopsy Panel samples not yet reported?",
	"What's the average coverage depth of passed samples?",
	"Why did SAM-100018 fail?",
];

function InputForm({
	input,
	onChange,
	onSubmit,
	disabled,
}: {
	input: ClinicOpsInput;
	onChange: (next: ClinicOpsInput) => void;
	onSubmit: () => void;
	disabled: boolean;
}) {
	return (
		<div className="demo-form">
			<label className="demo-label">
				<span>Ask a question about the synthetic clinical ops dataset</span>
				<textarea
					value={input.question}
					onChange={(e) => onChange({ question: e.target.value })}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey && !disabled) {
							e.preventDefault();
							onSubmit();
						}
					}}
					disabled={disabled}
					placeholder="e.g. How many samples are stuck in QC?"
					rows={2}
					maxLength={500}
					className="demo-textarea"
				/>
			</label>
			<div className="demo-examples">
				<span className="demo-examples-label">Try:</span>
				{EXAMPLES.map((q) => (
					<button
						key={q}
						type="button"
						onClick={() => onChange({ question: q })}
						disabled={disabled}
						className="demo-example-btn"
					>
						{q.length > 36 ? q.slice(0, 34) + "…" : q}
					</button>
				))}
			</div>
		</div>
	);
}

function intentPill(intent: ClinicOpsResult["intent"]): string {
	switch (intent) {
		case "query":
			return "demo-pill-success";
		case "hypothesis":
			return "demo-pill-warning";
		case "escalate":
			return "demo-pill-danger";
		default:
			return "demo-pill-muted";
	}
}

function formatCell(value: unknown): string {
	if (value == null) return "—";
	if (typeof value === "number") {
		// Epoch seconds heuristic
		if (value > 1_700_000_000 && value < 2_000_000_000) {
			return new Date(value * 1000).toISOString().slice(0, 10);
		}
		return String(value);
	}
	return String(value);
}

function ResultView({ result }: { result: ClinicOpsResult }) {
	return (
		<div className="demo-clinicops-result">
			<div className="demo-classification">
				<span className={`demo-pill ${intentPill(result.intent)}`}>{result.intent}</span>
				{result.rowCount != null && (
					<span className="demo-rowcount">
						{result.rowCount} row{result.rowCount === 1 ? "" : "s"}
					</span>
				)}
			</div>

			<p className="demo-narrative">{result.narrative}</p>

			{result.escalation && (
				<div className="demo-escalation">
					<strong>Escalate to:</strong> {result.escalation.to}
					<br />
					<strong>Reason:</strong> {result.escalation.reason}
				</div>
			)}

			{result.sql && (
				<details className="demo-sql-details">
					<summary>Generated SQL</summary>
					<pre className="demo-code-block">
						<code>{result.sql}</code>
					</pre>
				</details>
			)}

			{result.rows && result.rows.length > 0 && result.columns && (
				<div className="demo-table-wrap">
					<table className="demo-table">
						<thead>
							<tr>
								{result.columns.map((col) => (
									<th key={col}>{col}</th>
								))}
							</tr>
						</thead>
						<tbody>
							{result.rows.map((row, i) => (
								<tr key={i}>
									{result.columns?.map((col) => (
										<td key={col}>{formatCell(row[col])}</td>
									))}
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}

			<p className="demo-disclaimer">{result.disclaimer}</p>
		</div>
	);
}

export default function ClinicOpsDemo() {
	return (
		<DemoRunner<ClinicOpsInput, ClinicOpsResult>
			project="clinic-ops-copilot"
			endpoint="/api/demo/clinic-ops-copilot"
			title="Try ClinicOps Copilot"
			description="Ask a natural-language question about a synthetic clinical operations dataset. The copilot classifies intent, generates SQL, runs it against a seeded SQLite, and summarizes the result."
			inputComponent={InputForm}
			resultComponent={ResultView}
			initialInput={{ question: "How many samples are stuck in QC right now?" }}
		/>
	);
}
