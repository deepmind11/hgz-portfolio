# hgz-portfolio

> Personal portfolio site for Harshit Ghosh — building at the intersection of biology and AI.

The site is the demo. It features four open-source projects (VariantAgent, CovalentAgent, Constella, ClinicOps Copilot) and each one runs live in the browser.

## Stack

| Layer | Choice |
|---|---|
| Framework | [Astro 6](https://astro.build) + React islands |
| Styling | Tailwind v4 |
| Content | MDX + Astro content collections |
| Hosting | [Cloudflare Workers](https://developers.cloudflare.com/workers/) + Static Assets |
| API runtime | Cloudflare Workers (via the `@astrojs/cloudflare` adapter) |
| DB | Cloudflare D1 (synthetic FHIR dataset for the ClinicOps demo) |
| Cache | Cloudflare KV (demo result cache + rate limits) |
| Bio compute | [Modal](https://modal.com) for the CovalentAgent ESM-2 backend |
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

## Deploy

```bash
npm run deploy
```

## License

MIT — see [LICENSE](LICENSE).
