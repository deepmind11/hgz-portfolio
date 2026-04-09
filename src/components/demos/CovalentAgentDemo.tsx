import DemoRunner from "./DemoRunner";
import type { CovalentAgentInput, CovalentAgentResult } from "../../lib/demos/schema";

function InputForm({
	input,
	onChange,
	onSubmit,
	disabled,
}: {
	input: CovalentAgentInput;
	onChange: (next: CovalentAgentInput) => void;
	onSubmit: () => void;
	disabled: boolean;
}) {
	return (
		<div className="demo-form">
			<label className="demo-label">
				<span>UniProt ID (e.g. P01116 for KRAS)</span>
				<input
					type="text"
					value={input.uniprot_id}
					onChange={(e) => onChange({ uniprot_id: e.target.value })}
					onKeyDown={(e) => e.key === "Enter" && !disabled && onSubmit()}
					disabled={disabled}
					placeholder="P01116"
					className="demo-text-input"
				/>
			</label>
			<div className="demo-examples">
				<span className="demo-examples-label">Try:</span>
				{[
					{ id: "P01116", name: "KRAS" },
					{ id: "P04637", name: "TP53" },
					{ id: "P38398", name: "BRCA1" },
				].map((ex) => (
					<button
						key={ex.id}
						type="button"
						onClick={() => onChange({ uniprot_id: ex.id })}
						disabled={disabled}
						className="demo-example-btn"
					>
						{ex.name}
					</button>
				))}
			</div>
		</div>
	);
}

function ResultView({ result }: { result: CovalentAgentResult }) {
	return (
		<div>
			<h4>
				{result.uniprot_id} — {result.protein_name}
			</h4>
			<p>Sequence length: {result.sequence_length}</p>
			<h5>Reactive cysteines</h5>
			<table className="demo-table">
				<thead>
					<tr>
						<th>Position</th>
						<th>Context</th>
						<th>Score</th>
						<th>Notes</th>
					</tr>
				</thead>
				<tbody>
					{result.cysteines.map((c) => (
						<tr key={c.position}>
							<td>{c.position}</td>
							<td>
								<code>{c.context}</code>
							</td>
							<td>{c.reactivity_score.toFixed(3)}</td>
							<td>{c.notes}</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="demo-disclaimer">{result.disclaimer}</p>
		</div>
	);
}

export default function CovalentAgentDemo() {
	return (
		<DemoRunner<CovalentAgentInput, CovalentAgentResult>
			project="covalentagent"
			endpoint="/api/demo/covalentagent"
			title="Try CovalentAgent"
			description="Pick a UniProt ID and get a ranked list of reactive cysteines. Needs a Python GPU backend — coming once the Modal sandbox lands."
			inputComponent={InputForm}
			resultComponent={ResultView}
			initialInput={{ uniprot_id: "P01116" }}
		/>
	);
}
