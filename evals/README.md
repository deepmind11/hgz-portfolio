# Chatbot eval gate

Behavior tests for the Ask Harshit chatbot. Blocks deploys that regress on factuality, scope, adversarial resistance, or subjective answer quality.

## Running locally

```bash
# Run against production (default)
node evals/run.mjs

# Run against a different URL
node evals/run.mjs --url=http://localhost:4321

# Only the scope cases
node evals/run.mjs --filter=scope

# Emit a JSON report
node evals/run.mjs --out=eval-report.json
```

The runner reads `EVAL_TOKEN` from `.env` to bypass the chatbot's rate limit and `OPENROUTER_API_KEY` for the LLM-as-judge cases.

Exit codes:
- `0` — gate passed (all blocking cases pass AND overall rate ≥ 90%)
- `1` — gate failed
- `2` — runner error (network, setup)

## Cases

Defined in [`cases.mjs`](./cases.mjs). Each case has:
- `name` — unique identifier
- `category` — `factuality` | `scope` | `adversarial` | `quality`
- `criticality` — `blocking` (single failure blocks deploy) or `soft` (counts toward pass rate)
- `question` — sent to `/api/ask`
- `expect` — array of assertions, see below

### Assertion types

| Type | Semantics |
|---|---|
| `contains` | substring must appear (case-insensitive) |
| `contains_all` | ALL substrings must appear |
| `contains_any` | at least one substring must appear |
| `not_contains` | substring must NOT appear |
| `not_contains_any` | none of the substrings may appear |
| `max_length_chars` | response length ≤ N chars |
| `llm_judge` | LLM scores pass/fail against a criterion |

### Adding a case

1. Edit `cases.mjs`
2. Run `node evals/run.mjs --filter=<new-case-name>` to verify
3. Commit — CI will run the full suite on push

Keep the suite under ~20 cases to avoid bloating CI time. Each case costs a few hundred milliseconds plus one LLM call if it uses a judge.

## CI gate

The GitHub Actions workflow at [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs:
1. `npm run build`
2. `wrangler deploy` (deploys to production)
3. `node evals/run.mjs` (evaluates against live prod URL)

If the eval gate fails, the workflow fails — **but the deploy has already happened**. A future improvement is to promote via `wrangler versions deploy` only after the gate passes.

### Required GitHub secrets

| Secret | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | For `wrangler deploy`. Create via Cloudflare dashboard → My Profile → API Tokens with **Edit Cloudflare Workers** template plus **Workers AI Read**, **Vectorize Edit**, **D1 Edit** permissions. |
| `CLOUDFLARE_ACCOUNT_ID` | `a7d9a96a7e0bf51fcaa964d91939d4f4` |
| `EVAL_TOKEN` | Same value as the Worker's `EVAL_TOKEN` secret — allows the runner to skip chatbot rate limits |
| `OPENROUTER_API_KEY` | Same value as the Worker's `OPENROUTER_API_KEY` secret — used by the LLM-as-judge in `evals/run.mjs` |

Set them with `gh secret set` or via the GitHub repo Settings → Secrets and variables → Actions.

## Known limits

- Evals run against a live URL — the deploy is live before the gate runs.
- The eval runner is sequential. Twenty cases take ~20–30 seconds wall time.
- LLM-as-judge is non-deterministic. Use sparingly and prefer keyword assertions.
- The RAG index is separate state — eval failures due to stale vectors require `node scripts/build-rag.mjs --upload` before re-running evals.
