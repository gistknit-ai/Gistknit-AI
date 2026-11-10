"""GistKnit AI backend (Step 2): upload documents, ask questions, get answers with sources."""
import os
import time
import uuid

import httpx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import rag

# Apna model server (vLLM / Ollama etc.) ka address. Koi third-party AI company ka API nahi.
LLM_URL = os.environ.get("LLM_BASE_URL", "").rstrip("/")   # example: https://xxxx.proxy.runpod.net/v1
LLM_MODEL = os.environ.get("LLM_MODEL", "Qwen/Qwen2.5-7B-Instruct")
LLM_KEY = os.environ.get("LLM_API_KEY", "")                 # optional, apne server ki password
ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")

MAX_FILE = 10 * 1024 * 1024   # 10 MB
MAX_DOCS = 10                 # per visitor
ASKS_PER_HOUR = 30            # per visitor

app = FastAPI(title="GistKnit AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ORIGIN] if ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# In memory store. Data is lost when the server restarts (database comes in a later step).
DOCS = {}   # client_id -> {doc_id: {"name","size","pages","t","chunks":[...]}}
ASKS = {}   # client_id -> [timestamps]


def client(cid):
    if not cid or len(cid) > 64:
        raise HTTPException(400, "Missing client id.")
    return cid


@app.get("/health")
def health():
    return {"ok": True, "ai": bool(LLM_URL), "model": LLM_MODEL}


@app.get("/docs-list")
def docs_list(x_client_id: str = Header(None)):
    cid = client(x_client_id)
    return [
        {"id": k, "name": v["name"], "size": v["size"], "pages": v["pages"], "t": v["t"]}
        for k, v in DOCS.get(cid, {}).items()
    ]


@app.post("/upload")
async def upload(file: UploadFile = File(...), x_client_id: str = Header(None)):
    cid = client(x_client_id)
    mine = DOCS.setdefault(cid, {})
    if len(mine) >= MAX_DOCS:
        raise HTTPException(400, f"You can keep up to {MAX_DOCS} documents. Remove one first.")
    data = await file.read()
    if len(data) > MAX_FILE:
        raise HTTPException(400, "File is too big. Maximum is 10 MB.")
    try:
        pages = rag.extract_pages(file.filename or "file", data)
    except ValueError as e:
        raise HTTPException(400, str(e))
    chunks = rag.make_chunks(pages)
    doc_id = uuid.uuid4().hex[:10]
    mine[doc_id] = {
        "name": file.filename, "size": len(data), "pages": len(pages),
        "t": time.strftime("%Y-%m-%dT%H:%M:%S"), "chunks": chunks,
    }
    return {"id": doc_id, "name": file.filename, "pages": len(pages), "chunks": len(chunks)}


@app.delete("/docs/{doc_id}")
def delete_doc(doc_id: str, x_client_id: str = Header(None)):
    cid = client(x_client_id)
    DOCS.get(cid, {}).pop(doc_id, None)
    return {"ok": True}


class AskBody(BaseModel):
    question: str
    mode: str = "chat"
    style: str = "Short"


@app.post("/ask")
async def ask(body: AskBody, x_client_id: str = Header(None)):
    cid = client(x_client_id)
    q = body.question.strip()
    if not q or len(q) > 1000:
        raise HTTPException(400, "Question must be between 1 and 1000 characters.")
    if not LLM_URL:
        raise HTTPException(503, "AI server address is not set yet (LLM_BASE_URL).")
    mine = DOCS.get(cid, {})
    if not mine:
        raise HTTPException(400, "Add a document to your library first, then ask.")

    now = time.time()
    recent = [t for t in ASKS.get(cid, []) if now - t < 3600]
    if len(recent) >= ASKS_PER_HOUR:
        raise HTTPException(429, "Too many questions this hour. Please try again later.")
    ASKS[cid] = recent + [now]

    items = [
        {"doc_id": d, "doc_name": doc["name"], **c}
        for d, doc in mine.items() for c in doc["chunks"]
    ]
    top_k = 8 if body.mode == "research" else 4
    hits = rag.search(q, items, top_k)
    if not hits:
        return {"text": "I could not find this in your documents.", "src": []}

    payload = {
        "model": LLM_MODEL,
        "messages": rag.build_messages(q, hits, body.style),
        "temperature": 0.2,
        "max_tokens": 700 if body.style == "Short" else 1200,
    }
    try:
        async with httpx.AsyncClient(timeout=120) as http:
            r = await http.post(
                LLM_URL + "/chat/completions",
                headers={"ngrok-skip-browser-warning": "true", **({"Authorization": f"Bearer {LLM_KEY}"} if LLM_KEY else {})},
                json=payload,
            )
    except httpx.HTTPError:
        raise HTTPException(502, "Could not reach your AI server. Is it running?")
    if r.status_code != 200:
        raise HTTPException(502, f"AI server error ({r.status_code}). Check LLM_MODEL name and server.")
    text = r.json()["choices"][0]["message"]["content"].strip()
    src = [
        {"t": h["doc_name"], "s": f"Page {h['page']}", "q": h["text"][:200] + "..."}
        for h in hits
    ]
    return {"text": text, "src": src}
