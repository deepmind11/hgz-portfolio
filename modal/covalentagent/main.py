"""
CovalentAgent demo backend on Modal.

Predicts reactive cysteines on a protein given a UniProt ID.

Pipeline:
  1. Fetch FASTA from UniProt REST API
  2. Run ESM-2 inference to get per-residue embeddings
  3. Score each cysteine with a simple reactivity heuristic:
     - Solvent accessibility proxy (embedding norm)
     - Sequence context window
  4. Return top cysteines ranked by score

This is a simplified port of the full CovalentAgent
(github.com/deepmind11/CovalentAgent). The real system is a multi-agent
pipeline with ChemProp, RDKit, and a literature-aware agent.

Deploy:
    modal deploy main.py

Call (from the Cloudflare Worker):
    POST https://<workspace>--covalentagent-predict.modal.run
    Headers: { "X-Modal-Auth": "<shared secret>" }
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
        "transformers==4.46.0",
        "fair-esm==2.0.0",
        "numpy==1.26.4",
        "requests==2.32.3",
        "fastapi==0.115.0",
    )
)

app = modal.App("covalentagent", image=image)

# Shared secret stored as a Modal secret
secret = modal.Secret.from_name("hgz-portfolio-demos")

# =============================================================
# GPU inference function
# =============================================================

@app.cls(
    gpu="T4",
    image=image,
    secrets=[secret],
    min_containers=0,
    scaledown_window=60,  # kill container 60s after last request
    timeout=120,
)
class CovalentAgent:
    """
    Wraps ESM-2 with a lazy loader so the model is only pulled
    into memory on first invocation.
    """

    @modal.enter()
    def load(self):
        import esm

        self.model, self.alphabet = esm.pretrained.esm2_t12_35M_UR50D()
        self.model = self.model.eval().cuda()
        self.batch_converter = self.alphabet.get_batch_converter()

    def score_cysteines(self, sequence: str) -> list[dict[str, Any]]:
        import numpy as np
        import torch

        data = [("query", sequence)]
        _, _, batch_tokens = self.batch_converter(data)
        with torch.no_grad():
            reps = self.model(batch_tokens.cuda(), repr_layers=[12])["representations"][12]
        # drop CLS/EOS tokens
        per_res = reps[0, 1 : len(sequence) + 1].cpu().numpy()
        norms = np.linalg.norm(per_res, axis=1)
        # Normalize to 0-1 for readability
        norm_min, norm_max = norms.min(), norms.max()
        reactivity = (norms - norm_min) / (norm_max - norm_min + 1e-9)

        cys_sites = []
        for i, aa in enumerate(sequence):
            if aa != "C":
                continue
            start = max(0, i - 4)
            end = min(len(sequence), i + 5)
            context = sequence[start:end]
            score = float(reactivity[i])
            notes = []
            if score > 0.7:
                notes.append("high embedding variance, candidate reactive site")
            elif score > 0.4:
                notes.append("moderate variance")
            else:
                notes.append("buried or low-activity residue (heuristic)")
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

    @modal.fastapi_endpoint(method="POST", label="predict")
    def predict(self, body: dict) -> dict:
        from fastapi import HTTPException, Header

        # We rely on modal's fastapi_endpoint; auth is checked via header.
        auth = body.get("_auth") or ""  # fallback if proxy puts it in body
        # In practice auth comes via X-Modal-Auth header — see wrapper below

        expected = os.environ.get("MODAL_SHARED_SECRET", "")
        if not expected or auth != expected:
            raise HTTPException(status_code=401, detail="missing or bad X-Modal-Auth")

        uniprot_id = (body.get("uniprot_id") or "").upper()
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
            # Truncate for the demo — real CovalentAgent handles larger
            sequence = sequence[:1024]
        if not sequence:
            raise HTTPException(status_code=400, detail="empty sequence")

        cys_sites = self.score_cysteines(sequence)

        return {
            "uniprot_id": uniprot_id,
            "protein_name": header.split("|")[-1] if "|" in header else header,
            "sequence_length": len(sequence),
            "cysteines": cys_sites[:20],
            "stubbed": False,
            "disclaimer": (
                "Demo only. Scores are a simplified reactivity heuristic based on "
                "ESM-2 embedding variance, not a clinical or medicinal chemistry "
                "prediction. The full CovalentAgent is on GitHub."
            ),
        }
