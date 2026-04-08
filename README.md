# hgz-portfolio

> Personal portfolio site for [Harshit Ghosh](https://hgz.xo.je) — bioinformatics engineer building multi-agent AI systems for genomics, drug discovery, and clinical operations.

The site is the demo. It doesn't list "multi-agent systems" — it ships them. Visitors can chat with a RAG-grounded "Ask Harshit" bot and run live demos of the four featured projects (VariantAgent, CovalentAgent, Constella, ClinicOps Copilot).

## Stack

| Layer | Choice |
|---|---|
| Framework | [Astro 6](https://astro.build) + React islands |
| Styling | Tailwind v4 |
| Content | MDX + Astro content collections |
| Hosting | [Cloudflare Pages](https://pages.cloudflare.com) |
| API runtime | Cloudflare Workers (via the `@astrojs/cloudflare` adapter) |
| LLM | OpenRouter → `google/gemini-2.0-flash-001` (default), `anthropic/claude-sonnet-4.5` (escalation) |
| Embeddings | Cloudflare Workers AI (`@cf/baai/bge-base-en-v1.5`) |
| RAG store | Cloudflare Vectorize |
| DB | Cloudflare D1 |
| Bio compute | [Modal](https://modal.com) for the four live project demos |
| Observability | [Langfuse](https://langfuse.com) cloud |
| Analytics | Cloudflare Web Analytics |

## Local development

```bash
cp .env.example .env  # add your keys
npm install
npm run dev
```

Open <http://localhost:4321>.

## Build

```bash
npm run build
```

Output goes to `dist/client` (static assets) and `dist/server` (Worker entrypoint).

## Phases

- [x] **Phase 1** — Foundation: Astro on Cloudflare Pages, home, about, 4 project pages, contact, dark mode, SEO basics.
- [ ] **Phase 2** — Chatbot: floating "Ask Harshit" with Vectorize RAG, OpenRouter streaming, Langfuse traces, eval gate in CI.
- [ ] **Phase 3** — Live demos: 4 Modal-backed sandboxes wired to project pages with rate limiting and result caching.
- [ ] **Phase 4** — Polish: case studies, public `/ops` dashboard, OG images, JSON-LD, accessibility audit.

## License

MIT — see [LICENSE](LICENSE).
