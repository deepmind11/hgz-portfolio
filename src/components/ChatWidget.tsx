/**
 * Floating "Ask Harshit" chat widget. Mounts on every page.
 *
 * Features:
 * - Toggleable floating panel bottom-right
 * - SSE streaming responses with typing effect
 * - Conversation history (in-memory, resets on page refresh)
 * - Suggested starter questions
 * - Markdown rendering for assistant messages (links, bold, lists, code)
 * - Keyboard: Cmd/Ctrl+K to open, Esc to close, Enter to send (Shift+Enter for newline)
 */

import { useEffect, useRef, useState } from "react";

interface Message {
	role: "user" | "assistant";
	content: string;
	streaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
	"What does Harshit work on?",
	"Tell me about VariantAgent",
	"What are his target roles?",
	"Is he authorized to work in the US?",
];

const STORAGE_KEY = "hgz-chat-session";

export default function ChatWidget() {
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sessionId, setSessionId] = useState<string | null>(null);

	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const abortRef = useRef<AbortController | null>(null);

	// Restore session ID from localStorage
	useEffect(() => {
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) setSessionId(stored);
		} catch {
			// localStorage might be blocked
		}
	}, []);

	// Keyboard shortcuts
	useEffect(() => {
		function handleKey(e: KeyboardEvent) {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setOpen((o) => !o);
			} else if (e.key === "Escape" && open) {
				setOpen(false);
			}
		}
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [open]);

	// Auto-scroll on new content
	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	// Auto-focus input when opening
	useEffect(() => {
		if (open && inputRef.current) {
			setTimeout(() => inputRef.current?.focus(), 50);
		}
	}, [open]);

	async function send(question: string) {
		if (!question.trim() || loading) return;
		setError(null);
		setInput("");

		const userMsg: Message = { role: "user", content: question };
		const asstMsg: Message = { role: "assistant", content: "", streaming: true };
		const newMessages = [...messages, userMsg, asstMsg];
		setMessages(newMessages);
		setLoading(true);

		const abort = new AbortController();
		abortRef.current = abort;

		try {
			const res = await fetch("/api/ask", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				signal: abort.signal,
				body: JSON.stringify({
					messages: newMessages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
					sessionId,
				}),
			});

			if (!res.ok) {
				const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
				throw new Error(errBody.error || `HTTP ${res.status}`);
			}

			const sid = res.headers.get("X-Session-Id");
			if (sid && sid !== sessionId) {
				setSessionId(sid);
				try {
					localStorage.setItem(STORAGE_KEY, sid);
				} catch {
					// noop
				}
			}

			if (!res.body) throw new Error("No response body");

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let acc = "";

			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });

				let idx;
				while ((idx = buffer.indexOf("\n\n")) !== -1) {
					const event = buffer.slice(0, idx);
					buffer = buffer.slice(idx + 2);
					if (!event.startsWith("data:")) continue;
					try {
						const payload = JSON.parse(event.slice(5).trim());
						if (payload.type === "delta") {
							acc += payload.text;
							setMessages((prev) => {
								const next = [...prev];
								next[next.length - 1] = { role: "assistant", content: acc, streaming: true };
								return next;
							});
						} else if (payload.type === "done") {
							setMessages((prev) => {
								const next = [...prev];
								next[next.length - 1] = {
									role: "assistant",
									content: payload.full || acc,
									streaming: false,
								};
								return next;
							});
						} else if (payload.type === "error") {
							throw new Error(payload.message || "Stream error");
						}
					} catch (e) {
						if (e instanceof SyntaxError) continue;
						throw e;
					}
				}
			}

			setMessages((prev) => {
				const next = [...prev];
				const last = next[next.length - 1];
				if (last && last.role === "assistant") {
					next[next.length - 1] = { ...last, streaming: false };
				}
				return next;
			});
		} catch (e) {
			if ((e as Error).name === "AbortError") return;
			const msg = (e as Error).message || "Something went wrong";
			setError(msg);
			setMessages((prev) => prev.slice(0, -1));
		} finally {
			setLoading(false);
			abortRef.current = null;
		}
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		send(input);
	}

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			send(input);
		}
	}

	function reset() {
		abortRef.current?.abort();
		setMessages([]);
		setError(null);
	}

	return (
		<>
			{/* Floating button */}
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="chat-fab"
				aria-label={open ? "Close chat" : "Open chat with Harshit's AI assistant"}
				aria-expanded={open}
			>
				{open ? (
					<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
						<path
							d="M5 5l10 10M15 5L5 15"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
						/>
					</svg>
				) : (
					<>
						<svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
							<path
								d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8l-4 3v-3H5a2 2 0 0 1-2-2V5z"
								stroke="currentColor"
								strokeWidth="1.6"
								strokeLinejoin="round"
							/>
						</svg>
						<span>Ask Harshit</span>
					</>
				)}
			</button>

			{/* Chat panel */}
			{open && (
				<div className="chat-panel" role="dialog" aria-label="Ask Harshit chatbot">
					<header className="chat-header">
						<div>
							<div className="chat-title">Ask Harshit</div>
							<div className="chat-subtitle">AI assistant trained on his portfolio</div>
						</div>
						<button
							type="button"
							onClick={reset}
							className="chat-reset"
							aria-label="Reset conversation"
							title="Reset conversation"
						>
							New chat
						</button>
					</header>

					<div className="chat-scroll" ref={scrollRef}>
						{messages.length === 0 && (
							<div className="chat-empty">
								<p className="chat-empty-hello">
									Hi — I'm an AI assistant trained on Harshit's portfolio. Ask me about his
									projects, experience, or what he's looking for.
								</p>
								<div className="chat-suggested">
									{SUGGESTED_QUESTIONS.map((q) => (
										<button
											key={q}
											type="button"
											onClick={() => send(q)}
											className="chat-suggested-btn"
										>
											{q}
										</button>
									))}
								</div>
							</div>
						)}

						{messages.map((m, i) => (
							<div key={i} className={`chat-msg chat-msg-${m.role}`}>
								<div className="chat-bubble">
									{m.role === "assistant" ? (
										<MarkdownText text={m.content} streaming={m.streaming} />
									) : (
										m.content
									)}
								</div>
							</div>
						))}

						{error && (
							<div className="chat-error">
								<strong>Error:</strong> {error}
							</div>
						)}
					</div>

					<form className="chat-form" onSubmit={handleSubmit}>
						<textarea
							ref={inputRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Ask anything about Harshit's work..."
							rows={1}
							maxLength={2000}
							disabled={loading}
							className="chat-input"
							aria-label="Type your question"
						/>
						<button
							type="submit"
							disabled={loading || !input.trim()}
							className="chat-send"
							aria-label="Send message"
						>
							{loading ? (
								<span className="chat-spinner" aria-hidden="true" />
							) : (
								<svg width="16" height="16" viewBox="0 0 20 20" fill="none">
									<path
										d="M3 10l14-7-3 7 3 7-14-7z"
										stroke="currentColor"
										strokeWidth="1.6"
										strokeLinejoin="round"
										strokeLinecap="round"
									/>
								</svg>
							)}
						</button>
					</form>
					<div className="chat-foot">
						Streamed via Cloudflare Workers + RAG. Press <kbd>⌘K</kbd> to toggle.
					</div>
				</div>
			)}
		</>
	);
}

/**
 * Tiny markdown renderer for assistant output. Handles:
 * - **bold**, *italic*, `code`
 * - links [text](url)
 * - bullet lists (* or -)
 * - paragraphs (blank line)
 * - code blocks (```...```)
 * Intentionally minimal — no third-party deps in the client bundle.
 */
function MarkdownText({ text, streaming }: { text: string; streaming?: boolean }) {
	if (!text) {
		return streaming ? <span className="chat-cursor" aria-hidden="true" /> : null;
	}

	const blocks: React.ReactNode[] = [];
	const lines = text.split("\n");
	let i = 0;
	let key = 0;

	while (i < lines.length) {
		const line = lines[i];

		// Code block
		if (line.startsWith("```")) {
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // skip closing ```
			blocks.push(
				<pre key={key++} className="chat-code">
					<code>{codeLines.join("\n")}</code>
				</pre>,
			);
			continue;
		}

		// Bullet list
		if (/^[*-]\s+/.test(line)) {
			const items: string[] = [];
			while (i < lines.length && /^[*-]\s+/.test(lines[i])) {
				items.push(lines[i].replace(/^[*-]\s+/, ""));
				i++;
			}
			blocks.push(
				<ul key={key++} className="chat-list">
					{items.map((item, j) => (
						<li key={j}>{renderInline(item)}</li>
					))}
				</ul>,
			);
			continue;
		}

		// Paragraph (collect non-empty lines until blank)
		if (line.trim() === "") {
			i++;
			continue;
		}
		const paraLines: string[] = [];
		while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !/^[*-]\s+/.test(lines[i])) {
			paraLines.push(lines[i]);
			i++;
		}
		blocks.push(
			<p key={key++}>
				{renderInline(paraLines.join(" "))}
				{streaming && i >= lines.length && <span className="chat-cursor" aria-hidden="true" />}
			</p>,
		);
	}

	return <>{blocks}</>;
}

function renderInline(text: string): React.ReactNode {
	const parts: React.ReactNode[] = [];
	const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*([^*]+)\*)/g;
	let lastIdx = 0;
	let match;
	let key = 0;

	while ((match = re.exec(text)) !== null) {
		if (match.index > lastIdx) {
			parts.push(text.slice(lastIdx, match.index));
		}
		if (match[2]) {
			parts.push(<strong key={key++}>{match[2]}</strong>);
		} else if (match[3]) {
			parts.push(
				<code key={key++} className="chat-inline-code">
					{match[3]}
				</code>,
			);
		} else if (match[4] && match[5]) {
			parts.push(
				<a key={key++} href={match[5]} target="_blank" rel="noopener noreferrer">
					{match[4]}
				</a>,
			);
		} else if (match[6]) {
			parts.push(<em key={key++}>{match[6]}</em>);
		}
		lastIdx = re.lastIndex;
	}
	if (lastIdx < text.length) parts.push(text.slice(lastIdx));
	return parts;
}
