import DemoRunner from "./DemoRunner";
import type { ConstellaInput, ConstellaResult } from "../../lib/demos/schema";

function InputForm({
	input,
	onChange,
	onSubmit,
	disabled,
}: {
	input: ConstellaInput;
	onChange: (next: ConstellaInput) => void;
	onSubmit: () => void;
	disabled: boolean;
}) {
	return (
		<div className="demo-form">
			<label className="demo-label">
				<span>Type an English + Spanish sentence to synthesize</span>
				<textarea
					value={input.text}
					onChange={(e) => onChange({ ...input, text: e.target.value })}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey && !disabled) {
							e.preventDefault();
							onSubmit();
						}
					}}
					disabled={disabled}
					placeholder="The results came back and I'm still not sure, pero vamos a seguir."
					rows={2}
					maxLength={300}
					className="demo-textarea"
				/>
			</label>
			<div className="demo-examples">
				<span className="demo-examples-label">Try:</span>
				{[
					"I was working on the analysis pero me quedé sin coffee.",
					"Let's ship this feature, pero testeamos primero.",
				].map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => onChange({ ...input, text: t })}
						disabled={disabled}
						className="demo-example-btn"
					>
						{t.slice(0, 40)}…
					</button>
				))}
			</div>
		</div>
	);
}

function ResultView({ result }: { result: ConstellaResult }) {
	return (
		<div>
			<p className="demo-narrative">{result.text}</p>
			<div className="demo-spans">
				{result.detected_spans.map((s, i) => (
					<span key={i} className={`demo-span demo-span-${s.lang}`}>
						{s.text}
					</span>
				))}
			</div>
			{result.audio_url && (
				<audio controls src={result.audio_url} className="demo-audio">
					Your browser doesn't support audio playback.
				</audio>
			)}
			<p className="demo-disclaimer">{result.disclaimer}</p>
		</div>
	);
}

export default function ConstellaDemo() {
	return (
		<DemoRunner<ConstellaInput, ConstellaResult>
			project="constella"
			endpoint="/api/demo/constella"
			title="Try Constella"
			description="Type a sentence that code-switches between English and Spanish, and Constella will synthesize it in one voice. Needs a Python GPU backend — coming once the Modal sandbox lands."
			inputComponent={InputForm}
			resultComponent={ResultView}
			initialInput={{
				text: "I was working on the analysis pero me quedé sin coffee.",
			}}
		/>
	);
}
