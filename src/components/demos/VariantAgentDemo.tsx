import DemoRunner from "./DemoRunner";
import type { VariantAgentInput, VariantAgentResult } from "../../lib/demos/schema";

const EXAMPLES: Array<{ label: string; variant: string; note: string }> = [
	{
		label: "BRCA1 rare",
		variant: "17:43057078:T:C",
		note: "Rare BRCA1 missense — should land in VUS or Likely pathogenic",
	},
	{
		label: "Common SNP",
		variant: "1:55039839:G:C",
		note: "Common polymorphism — should land in Benign via BA1",
	},
	{
		label: "TP53 R175H",
		variant: "17:7675088:C:T",
		note: "Classic TP53 hotspot — should be Pathogenic",
	},
];

function InputForm({
	input,
	onChange,
	onSubmit,
	disabled,
}: {
	input: VariantAgentInput;
	onChange: (next: VariantAgentInput) => void;
	onSubmit: () => void;
	disabled: boolean;
}) {
	return (
		<div className="demo-form">
			<label className="demo-label">
				<span>Variant (chromosome:position:ref:alt, GRCh38)</span>
				<input
					type="text"
					value={input.variant}
					onChange={(e) => onChange({ ...input, variant: e.target.value })}
					onKeyDown={(e) => e.key === "Enter" && !disabled && onSubmit()}
					disabled={disabled}
					placeholder="17:43045712:A:G"
					className="demo-text-input"
				/>
			</label>
			<div className="demo-examples">
				<span className="demo-examples-label">Try:</span>
				{EXAMPLES.map((ex) => (
					<button
						key={ex.label}
						type="button"
						title={ex.note}
						onClick={() => onChange({ ...input, variant: ex.variant })}
						disabled={disabled}
						className="demo-example-btn"
					>
						{ex.label}
					</button>
				))}
			</div>
		</div>
	);
}

function classColor(cls: VariantAgentResult["classification"]): string {
	switch (cls) {
		case "Pathogenic":
		case "Likely pathogenic":
			return "demo-pill-danger";
		case "Benign":
		case "Likely benign":
			return "demo-pill-success";
		case "VUS":
			return "demo-pill-warning";
		default:
			return "demo-pill-muted";
	}
}

function ResultView({ result }: { result: VariantAgentResult }) {
	return (
		<div className="demo-variant-result">
			<div className="demo-classification">
				<div className="demo-variant-id">
					<code>
						{result.variant.chromosome}:{result.variant.position}:{result.variant.ref}&gt;
						{result.variant.alt}
					</code>
					<span className="demo-assembly">{result.variant.assembly}</span>
				</div>
				<span className={`demo-pill ${classColor(result.classification)}`}>
					{result.classification}
				</span>
			</div>

			{result.criteriaApplied.length > 0 ? (
				<div className="demo-criteria">
					<h4>ACMG criteria applied</h4>
					<table className="demo-table">
						<thead>
							<tr>
								<th>Code</th>
								<th>Weight</th>
								<th>Evidence</th>
							</tr>
						</thead>
						<tbody>
							{result.criteriaApplied.map((c) => (
								<tr key={c.code}>
									<td>
										<code>{c.code}</code>
									</td>
									<td>{c.weight}</td>
									<td>
										{c.evidence}
										<br />
										<span className="demo-source">source: {c.source}</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<p className="demo-empty-line">No ACMG criteria triggered — insufficient evidence.</p>
			)}

			<div className="demo-source-panels">
				<div className="demo-panel">
					<h5>ClinVar</h5>
					{result.clinvar?.id ? (
						<ul>
							<li>
								<strong>Classification:</strong> {result.clinvar.interpretation}
							</li>
							<li>
								<strong>Review:</strong> {result.clinvar.review_status}
							</li>
							<li>
								<a href={result.clinvar.url ?? "#"} target="_blank" rel="noopener noreferrer">
									View in ClinVar →
								</a>
							</li>
						</ul>
					) : (
						<p className="demo-panel-empty">No ClinVar record at this position.</p>
					)}
				</div>
				<div className="demo-panel">
					<h5>gnomAD v4</h5>
					{result.gnomad?.allele_number ? (
						<ul>
							<li>
								<strong>AF:</strong>{" "}
								{result.gnomad.allele_frequency != null
									? result.gnomad.allele_frequency.toExponential(2)
									: "n/a"}
							</li>
							<li>
								<strong>AC/AN:</strong> {result.gnomad.allele_count}/{result.gnomad.allele_number}
							</li>
							<li>
								<strong>popmax AF:</strong>{" "}
								{result.gnomad.popmax_af != null
									? result.gnomad.popmax_af.toExponential(2)
									: "n/a"}
							</li>
							<li>
								<a href={result.gnomad.url ?? "#"} target="_blank" rel="noopener noreferrer">
									View in gnomAD →
								</a>
							</li>
						</ul>
					) : (
						<p className="demo-panel-empty">Not indexed in gnomAD v4.</p>
					)}
				</div>
			</div>

			<p className="demo-disclaimer">{result.disclaimer}</p>
		</div>
	);
}

export default function VariantAgentDemo() {
	return (
		<DemoRunner<VariantAgentInput, VariantAgentResult>
			project="variantagent"
			endpoint="/api/demo/variantagent"
			title="Try VariantAgent"
			description="Paste a variant and get an ACMG classification grounded in ClinVar and gnomAD. Simplified demo, not clinical."
			inputComponent={InputForm}
			resultComponent={ResultView}
			initialInput={{ variant: "17:7675088:C:T", assembly: "GRCh38" }}
		/>
	);
}
