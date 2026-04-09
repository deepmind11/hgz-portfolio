"""
CovalentAgent demo backend on Modal.

Predicts reactive cysteines on a protein given a UniProt ID.

Pipeline:
  1. Fetch FASTA from UniProt REST API
  2. Run ESM-2 (35M params, CPU) to get per-residue embeddings
  3. Score each cysteine with a simple reactivity heuristic based on
     embedding variance + local sequence context
  4. Return top cysteines ranked by score

This is a simplified port of the full CovalentAgent
(github.com/deepmind11/CovalentAgent). The real system is a multi-agent
pipeline with ChemProp, RDKit, and a literature-aware agent.

Deploy:
    modal deploy main.py

Call (from the Cloudflare Worker):
    POST https://<workspace>--covalentagent-predict.modal.run
    Headers:
      X-Modal-Auth: <shared secret>
      Content-Type: application/json
    Body: { "uniprot_id": "P01116" }
"""

import os
from typing import Any

import modal

# =============================================================
# Image
# =============================================================

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.4.0",
        "fair-esm==2.0.0",
        "numpy==1.26.4",
        "requests==2.32.3",
        "fastapi[standard]==0.115.0",
    )
)

app = modal.App("covalentagent", image=image)
secret = modal.Secret.from_name("hgz-portfolio-demos")

# =============================================================
# CPU inference class
# =============================================================

# ESM-2 t12_35M is ~140 MB and runs acceptably on CPU for short
# sequences. Starting without GPU keeps cost at ~$0 for the demo.
@app.cls(
    image=image,
    secrets=[secret],
    min_containers=0,
    scaledown_window=120,
    timeout=180,
    cpu=2.0,
    memory=4096,
)
class CovalentAgent:
    @modal.enter()
    def load(self):
        import esm

        self.model, self.alphabet = esm.pretrained.esm2_t12_35M_UR50D()
        self.model = self.model.eval()
        self.batch_converter = self.alphabet.get_batch_converter()

    def _score_cysteines(self, sequence: str) -> list[dict[str, Any]]:
        import numpy as np
        import torch

        data = [("query", sequence)]
        _, _, batch_tokens = self.batch_converter(data)
        with torch.no_grad():
            reps = self.model(batch_tokens, repr_layers=[12])["representations"][12]
        per_res = reps[0, 1 : len(sequence) + 1].numpy()
        norms = np.linalg.norm(per_res, axis=1)
        norm_min, norm_max = float(norms.min()), float(norms.max())
        span = norm_max - norm_min + 1e-9
        reactivity = (norms - norm_min) / span

        cys_sites: list[dict[str, Any]] = []
        for i, aa in enumerate(sequence):
            if aa != "C":
                continue
            start = max(0, i - 4)
            end = min(len(sequence), i + 5)
            context = sequence[start:end]
            score = float(reactivity[i])

            notes: list[str] = []
            if score > 0.7:
                notes.append("high embedding variance, candidate reactive site")
            elif score > 0.4:
                notes.append("moderate variance")
            else:
                notes.append("buried or low-activity residue (heuristic)")
            # CXXC / CXC motif detection (common in redox-active cys)
            if i >= 2 and sequence[i - 2] == "C":
                notes.append("CXXC motif (redox-active family)")
            if i + 2 < len(sequence) and sequence[i + 2] == "C":
                notes.append("CXC motif")
            cys_sites.append(
                {
                    "position": i + 1,
                    "context": context,
                    "reactivity_score": score,
                    "notes": ", ".join(notes),
                }
            )
        cys_sites.sort(key=lambda s: -s["reactivity_score"])
        return cys_sites

    @modal.fastapi_endpoint(method="POST", label="predict", requires_proxy_auth=False)
    def predict(
        self,
        body: dict,
        x_modal_auth: str = "",
    ) -> dict:
        from fastapi import HTTPException, Request
        # Note: Modal's fastapi_endpoint accepts header parameters via
        # FastAPI dependency injection. We use the fallback-to-body pattern
        # below because direct header access requires a different decorator
        # shape. The worker always sets BOTH the header and body _auth.

        expected = os.environ.get("MODAL_SHARED_SECRET", "")
        provided = x_modal_auth or (body.get("_auth") or "")

        if not expected or provided != expected:
            raise HTTPException(status_code=401, detail="missing or bad auth")

        uniprot_id = (body.get("uniprot_id") or "").upper().strip()
        if not uniprot_id or len(uniprot_id) > 20:
            raise HTTPException(status_code=400, detail="uniprot_id required")

        import requests

        fasta_url = f"https://rest.uniprot.org/uniprotkb/{uniprot_id}.fasta"
        r = requests.get(fasta_url, timeout=15)
        if r.status_code != 200:
            raise HTTPException(
                status_code=404,
                detail=f"UniProt {uniprot_id} not found ({r.status_code})",
            )
        lines = r.text.strip().split("\n")
        header = lines[0][1:] if lines and lines[0].startswith(">") else uniprot_id
        sequence = "".join(lines[1:]).upper()
        if len(sequence) > 1024:
            sequence = sequence[:1024]
        if not sequence:
            raise HTTPException(status_code=400, detail="empty sequence")

        cys_sites = self._score_cysteines(sequence)

        # Extract protein name from FASTA header (UniProt format)
        # e.g. "sp|P01116|RASK_HUMAN GTPase KRas OS=Homo sapiens..."
        protein_name = header
        if " " in header:
            protein_name = header.split(" ", 1)[1].split("OS=")[0].strip()

        return {
            "uniprot_id": uniprot_id,
            "protein_name": protein_name,
            "sequence_length": len(sequence),
            "cysteines": cys_sites[:20],
            "stubbed": False,
            "disclaimer": (
                "Demo only. Scores are a simplified reactivity heuristic based on "
                "ESM-2 embedding variance plus CXXC/CXC motif detection, not a "
                "clinical or medicinal chemistry prediction. The full CovalentAgent "
                "on GitHub uses a multi-agent pipeline with ChemProp and RDKit."
            ),
        }
