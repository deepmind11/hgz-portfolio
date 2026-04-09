"""
Constella demo backend on Modal.

Given an English+Spanish sentence, detects language spans and
synthesizes speech in one voice using a code-switched TTS model.

For the demo we use a smaller, faster TTS stack than the real
Constella — it's a simplified reimplementation that shows the voice
constellation concept but doesn't train its own voice clones.

Pipeline:
  1. Detect language spans (simple rule-based + dictionary lookup)
  2. Generate phonetic codepoints per span
  3. Run Coqui TTS (VCTK model) to synthesize a single waveform
  4. Return audio as base64-encoded WAV

Deploy:
    modal deploy main.py

Call (from the Cloudflare Worker):
    POST https://<workspace>--constella-synthesize.modal.run
    Body: { "text": "...", "_auth": "<shared secret>" }
"""

import base64
import io
import os
from typing import Any

import modal

# =============================================================
# Image
# =============================================================

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libsndfile1", "espeak-ng")
    .pip_install(
        "torch==2.4.0",
        "numpy==1.26.4",
        "TTS==0.22.0",  # Coqui TTS
        "soundfile==0.12.1",
        "fastapi==0.115.0",
    )
)

app = modal.App("constella", image=image)
secret = modal.Secret.from_name("hgz-portfolio-demos")

# =============================================================
# Span detection (simplified)
# =============================================================

SPANISH_CUES = {
    "el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del",
    "en", "y", "o", "pero", "con", "sin", "por", "para", "que", "qué",
    "cuando", "donde", "dónde", "como", "cómo", "pero", "aquí", "ahí",
    "me", "te", "se", "nos", "vos", "yo", "tú", "él", "ella", "nosotros",
    "es", "son", "fue", "está", "estar", "ser", "ir", "vamos", "seguir",
    "primero", "testeamos", "quedé", "sin", "sí", "no", "muy", "más",
}


def detect_spans(text: str) -> list[dict[str, str]]:
    tokens = text.split()
    spans: list[dict[str, str]] = []
    current_lang = "en"
    current_tokens: list[str] = []

    def flush():
        if current_tokens:
            spans.append({"lang": current_lang, "text": " ".join(current_tokens)})

    for tok in tokens:
        stripped = "".join(ch for ch in tok.lower() if ch.isalpha())
        lang = "es" if stripped in SPANISH_CUES else "en"
        if lang != current_lang and current_tokens:
            flush()
            current_tokens = []
            current_lang = lang
        else:
            current_lang = lang
        current_tokens.append(tok)
    flush()
    return spans


# =============================================================
# TTS
# =============================================================

@app.cls(
    gpu="T4",
    image=image,
    secrets=[secret],
    min_containers=0,
    scaledown_window=60,
    timeout=120,
)
class Constella:
    @modal.enter()
    def load(self):
        from TTS.api import TTS

        # Multi-language multi-speaker model
        self.tts = TTS(
            model_name="tts_models/multilingual/multi-dataset/xtts_v2",
            gpu=True,
        )

    @modal.fastapi_endpoint(method="POST", label="synthesize")
    def synthesize(self, body: dict) -> dict:
        from fastapi import HTTPException

        auth = body.get("_auth") or ""
        expected = os.environ.get("MODAL_SHARED_SECRET", "")
        if not expected or auth != expected:
            raise HTTPException(status_code=401, detail="missing or bad X-Modal-Auth")

        text = (body.get("text") or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="text required")
        if len(text) > 300:
            raise HTTPException(status_code=400, detail="text too long (max 300 chars)")

        spans = detect_spans(text)

        # XTTS v2 handles code-switching reasonably well inline.
        # We pass the full text with a single language tag ("es" tolerates English).
        import soundfile as sf

        wav = self.tts.tts(
            text=text,
            language="es" if any(s["lang"] == "es" for s in spans) else "en",
            speaker="Andrew Chipper",
        )

        buf = io.BytesIO()
        sf.write(buf, wav, 24000, format="WAV")
        audio_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        return {
            "text": text,
            "detected_spans": spans,
            "audio_url": f"data:audio/wav;base64,{audio_b64}",
            "audio_format": "wav",
            "stubbed": False,
            "disclaimer": (
                "Demo only. Uses Coqui XTTS v2 (off-the-shelf) for code-switched "
                "synthesis. The full Constella trains custom voice constellations "
                "on top of Microsoft VibeVoice — see GitHub for that pipeline."
            ),
        }
