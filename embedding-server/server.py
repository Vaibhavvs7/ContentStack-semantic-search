# server.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
from typing import List
import numpy as np

app = FastAPI(title="Local Embedding Server")

# pick a compact model; "all-MiniLM-L6-v2" is common and fast
MODEL_NAME = "all-MiniLM-L6-v2"
model = SentenceTransformer(MODEL_NAME)

class SingleRequest(BaseModel):
    text: str

class BatchRequest(BaseModel):
    texts: List[str]

@app.get("/health")
async def health():
    return {"ok": True, "model": MODEL_NAME}

@app.post("/embed")
async def embed(req: SingleRequest):
    if not req.text:
        raise HTTPException(status_code=400, detail="Missing text")
    vec = model.encode(req.text, convert_to_numpy=True).astype(float).tolist()
    return {"embedding": vec}

@app.post("/embed_batch")
async def embed_batch(req: BatchRequest):
    if not req.texts or len(req.texts) == 0:
        raise HTTPException(status_code=400, detail="Missing texts")
    vecs = model.encode(req.texts, convert_to_numpy=True)
    # convert numpy floats to native python floats for JSON
    out = [v.astype(float).tolist() for v in vecs]
    return {"embeddings": out}
