-- hgz-portfolio chat database schema
-- Stores chatbot conversations + rate limits + retrieved context for analytics

CREATE TABLE IF NOT EXISTS chat_messages (
	id TEXT PRIMARY KEY,
	session_id TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
	content TEXT NOT NULL,
	model TEXT,
	prompt_tokens INTEGER,
	completion_tokens INTEGER,
	latency_ms INTEGER,
	retrieved_chunks TEXT,
	langfuse_trace_id TEXT,
	user_ip_hash TEXT,
	user_country TEXT,
	user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
	ip_hash TEXT PRIMARY KEY,
	window_start INTEGER NOT NULL,
	request_count INTEGER NOT NULL DEFAULT 0,
	total_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);

CREATE TABLE IF NOT EXISTS feedback (
	id TEXT PRIMARY KEY,
	message_id TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
	comment TEXT,
	FOREIGN KEY (message_id) REFERENCES chat_messages(id)
);
