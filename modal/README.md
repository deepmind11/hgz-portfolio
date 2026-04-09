# Modal Python backends

Python compute backends for the two live demos that need PyTorch/GPU: **CovalentAgent** (ESM-2 reactive-cysteine prediction) and **Constella** (VibeVoice code-switched audio synthesis).

The worker-native demos (VariantAgent and ClinicOps Copilot) run entirely inside Cloudflare Workers and don't need Modal.

## Layout

```
modal/
├── covalentagent/
│   └── main.py          # ESM-2 inference + cysteine scoring
├── constella/
│   └── main.py          # VibeVoice TTS with code-switch detection
└── README.md            # this file
```

Each function is deployed as a standalone Modal app with an HTTPS endpoint that the Cloudflare Worker proxies to. The worker knows an `X-Modal-Auth` shared secret; the browser never sees Modal credentials directly.

## Setup

```bash
# Once per machine
pip install modal
modal token new  # logs in and writes ~/.modal.toml

# Deploy a function
cd modal/covalentagent
modal deploy main.py
```

`modal deploy` prints the live endpoint URL. Copy it into the worker's env:

```bash
cd ../..
echo "MODAL_COVALENTAGENT_URL=https://<your-account>--covalentagent-predict.modal.run" >> .dev.vars
echo "https://..." | npx wrangler secret put MODAL_COVALENTAGENT_URL
```

Then flip the corresponding API route in `src/pages/api/demo/*.ts` from the 501 stub to a real proxy — see the commented-out proxy skeleton in each file.

## Shared secret

Generate once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the same value as both:
- `MODAL_SHARED_SECRET` on Modal (`modal secret create hgz-portfolio-demos MODAL_SHARED_SECRET=<value>`)
- `MODAL_SHARED_SECRET` on the Cloudflare Worker (`npx wrangler secret put MODAL_SHARED_SECRET`)

Each Modal function requires the header `X-Modal-Auth: <secret>` and rejects requests without it.

## Cost notes

Both functions use Modal's free tier (~$30/mo compute credit). To keep costs low:
- `container_idle_timeout=60` seconds — containers spin down quickly after use
- Small GPU (T4) where possible
- Response caching via Cloudflare KV on the worker side — duplicate requests don't re-invoke Modal
- Per-IP rate limits enforced at the worker edge before any Modal call
