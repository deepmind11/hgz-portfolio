import { useState, useEffect, useRef } from "react";
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
				<span>Type a sentence that switches between English and Spanish</span>
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
					"The pipeline is down again. Voy a investigar qué pasó.",
					"It's a big day, ¡vamos a celebrar!",
				].map((t) => (
					<button
						key={t}
						type="button"
						onClick={() => onChange({ ...input, text: t })}
						disabled={disabled}
						className="demo-example-btn"
					>
						{t.length > 34 ? t.slice(0, 32) + "…" : t}
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * Browser-side sequential synthesis using Web Speech API.
 * Each span plays with its own language-tagged voice.
 */
function SpeechPlayer({ spans }: { spans: Array<{ lang: "en" | "es"; text: string }> }) {
	const [playing, setPlaying] = useState(false);
	const [currentSpan, setCurrentSpan] = useState(-1);
	const [available, setAvailable] = useState(false);
	const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
	const queueRef = useRef<Array<{ lang: "en" | "es"; text: string }>>([]);

	useEffect(() => {
		if (typeof window === "undefined" || !window.speechSynthesis) {
			setAvailable(false);
			return;
		}
		setAvailable(true);

		const loadVoices = () => {
			const v = window.speechSynthesis.getVoices();
			if (v.length > 0) setVoices(v);
		};
		loadVoices();
		window.speechSynthesis.onvoiceschanged = loadVoices;
		return () => {
			window.speechSynthesis.cancel();
		};
	}, []);

	function pickVoice(lang: "en" | "es"): SpeechSynthesisVoice | null {
		const target = lang === "es" ? "es" : "en";
		// Prefer native OS voices tagged for the target language
		const match = voices.find((v) => v.lang.toLowerCase().startsWith(target));
		return match ?? null;
	}

	function play() {
		if (!available || playing) return;
		setPlaying(true);
		setCurrentSpan(0);
		queueRef.current = spans.slice();
		playNext(0);
	}

	function playNext(idx: number) {
		if (idx >= queueRef.current.length) {
			setPlaying(false);
			setCurrentSpan(-1);
			return;
		}
		const span = queueRef.current[idx];
		const utterance = new SpeechSynthesisUtterance(span.text);
		const voice = pickVoice(span.lang);
		if (voice) {
			utterance.voice = voice;
			utterance.lang = voice.lang;
		} else {
			utterance.lang = span.lang === "es" ? "es-ES" : "en-US";
		}
		utterance.rate = 1.0;
		utterance.onend = () => {
			setCurrentSpan(idx + 1);
			playNext(idx + 1);
		};
		utterance.onerror = () => {
			setPlaying(false);
			setCurrentSpan(-1);
		};
		window.speechSynthesis.speak(utterance);
	}

	function stop() {
		window.speechSynthesis.cancel();
		setPlaying(false);
		setCurrentSpan(-1);
	}

	if (!available) {
		return (
			<p className="demo-panel-empty">
				Your browser doesn't support Web Speech API. Try Chrome, Edge, or Safari.
			</p>
		);
	}

	return (
		<div className="demo-speech-controls">
			<button
				type="button"
				onClick={playing ? stop : play}
				disabled={spans.length === 0}
				className="demo-run-btn"
				style={{ minWidth: "8rem" }}
			>
				{playing ? "■ Stop" : "▶ Play"}
			</button>
			{voices.length > 0 && (
				<span className="demo-voice-info">
					Using {voices.filter((v) => v.lang.startsWith("en")).length} EN / {voices.filter((v) => v.lang.startsWith("es")).length} ES voices
				</span>
			)}
			{currentSpan >= 0 && currentSpan < spans.length && (
				<span className="demo-voice-info">
					Span {currentSpan + 1}/{spans.length}:{" "}
					<span className={`demo-span demo-span-${spans[currentSpan].lang}`}>
						{spans[currentSpan].lang}
					</span>
				</span>
			)}
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
						<span className="demo-span-lang">{s.lang}</span>
						{s.text}
					</span>
				))}
			</div>
			<SpeechPlayer spans={result.detected_spans} />
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
			description="Type a sentence that code-switches between English and Spanish. Constella detects each language span on the edge; your browser then plays the audio with per-span native voices."
			inputComponent={InputForm}
			resultComponent={ResultView}
			initialInput={{
				text: "I was working on the analysis pero me quedé sin coffee.",
			}}
		/>
	);
}
