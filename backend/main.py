"""GistKnit AI backend (Step 3): one chat that can use your documents or the web, and shows sources."""
import os
import re
import time
import uuid
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import rag
import web

# Apna model server (Ollama / vLLM). Koi third-party AI company ka API nahi.
LLM_URL = os.environ.get("LLM_BASE_URL", "").rstrip("/")   # example: https://xxxx.ngrok-free.app/v1
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen2.5:7b")
LLM_KEY = os.environ.get("LLM_API_KEY", "")                 # optional
ORIGIN = os.environ.get("FRONTEND_ORIGIN", "*")

MAX_FILE = 10 * 1024 * 1024
MAX_DOCS = 10
ASKS_PER_HOUR = 30

app = FastAPI(title="GistKnit AI")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ORIGIN] if ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCS = {}   # client_id -> {doc_id: {...}}   (server restart par hat jata hai)
ASKS = {}   # client_id -> [timestamps]
GREET = re.compile(r"^\s*(hi+|hello|hey+|hlo|helo|namaste|wassup|what'?s up|thanks|thank you|ok|okay)\b", re.I)


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
    return [{"id": k, "name": v["name"], "size": v["size"], "pages": v["pages"], "t": v["t"]}
            for k, v in DOCS.get(cid, {}).items()]


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
    mine[doc_id] = {"name": file.filename, "size": len(data), "pages": len(pages),
                    "t": time.strftime("%Y-%m-%dT%H:%M:%S"), "chunks": chunks}
    return {"id": doc_id, "name": file.filename, "pages": len(pages), "chunks": len(chunks)}


@app.delete("/docs/{doc_id}")
def delete_doc(doc_id: str, x_client_id: str = Header(None)):
    cid = client(x_client_id)
    DOCS.get(cid, {}).pop(doc_id, None)
    return {"ok": True}


class Msg(BaseModel):
    role: str
    content: str


class AskBody(BaseModel):
    question: str
    mode: str = "chat"        # "chat" (quick) or "research" (deep)
    style: str = "Short"
    source: str = "auto"      # "auto", "docs" or "web"
    history: list[Msg] = []


async def llm(http, messages, max_tokens=700, temperature=0.2):
    try:
        r = await http.post(
            LLM_URL + "/chat/completions",
            headers={"ngrok-skip-browser-warning": "true", **({"Authorization": f"Bearer {LLM_KEY}"} if LLM_KEY else {})},
            json={"model": LLM_MODEL, "messages": messages, "temperature": temperature, "max_tokens": max_tokens},
        )
    except httpx.HTTPError:
        raise HTTPException(502, "Could not reach your AI server. Is Colab running?")
    if r.status_code != 200:
        detail = re.sub(r"<[^>]+>", " ", r.text)
        detail = re.sub(r"\s+", " ", detail).strip()[:160]
        raise HTTPException(502, f"AI server error ({r.status_code}). {detail}")
    return r.json()["choices"][0]["message"]["content"].strip()


async def decide(http, q, history, has_docs):
    """Ask the model: WEB, DOCS or CHAT, plus a short search query."""
    recent = "\n".join(f"{m.role}: {m.content[:200]}" for m in history[-4:]) or "(none)"
    prompt = (
        "You route a user's message for a research assistant. Reply with exactly two lines.\n"
        "Line 1, one word: WEB (needs internet research or current facts), DOCS (about the user's uploaded documents), "
        "or CHAT (greeting, chit-chat, writing help, or simple general knowledge that needs no sources).\n"
        "Line 2: a short standalone search query for WEB or DOCS (use the conversation to complete follow-ups), or - for CHAT.\n"
        f"User has uploaded documents: {'yes' if has_docs else 'no'}\n"
        f"Conversation so far:\n{recent}\n\nMessage: {q}"
    )
    out = await llm(http, [{"role": "user", "content": prompt}], 60, 0)
    lines = [l.strip() for l in out.splitlines() if l.strip()]
    word = lines[0].upper() if lines else ""
    route = next((r for r in ("WEB", "DOCS", "CHAT") if word.startswith(r)), None)
    query = lines[1].strip(" \"'") if len(lines) > 1 and lines[1] != "-" else q
    if route is None:
        route = "CHAT" if (GREET.match(q) or len(q.split()) <= 2) else ("DOCS" if has_docs else "WEB")
    return route, (query or q)[:200]


def build_messages(question, sources, style, history, today):
    length = "Keep the answer short, about 3 to 5 sentences." if style == "Short" else "Give a detailed, well organised answer with key points."
    lang = "Reply in the same language and script the user writes in."
    if sources:
        system = (f"You are GistKnit AI, a research assistant. Today is {today}. Answer ONLY from the numbered sources given. "
                  "After each claim add the source number in square brackets, like [1] or [2]. "
                  "If the sources do not contain the answer, say clearly what is missing and do not guess. " + lang + " " + length)
    else:
        system = (f"You are GistKnit AI, a friendly research assistant. Today is {today}. Answer directly and helpfully. "
                  "You are not searching the internet in this reply, so if the user needs current facts or sources, "
                  "tell them they can ask you to search the web. " + lang + " " + length)
    msgs = [{"role": "system", "content": system}]
    for m in history[-6:]:
        role = "assistant" if m.role in ("assistant", "a") else "user"
        msgs.append({"role": role, "content": re.sub(r"\[\d+\]", "", m.content)[:800]})
    if sources:
        block = "\n\n".join(f"[{n}] {s['label']}\n{s['text']}" for n, s in enumerate(sources, 1))
        msgs.append({"role": "user", "content": f"Sources:\n{block}\n\nQuestion: {question}"})
    else:
        msgs.append({"role": "user", "content": question})
    return msgs


@app.post("/ask")
async def ask(body: AskBody, x_client_id: str = Header(None)):
    cid = client(x_client_id)
    q = body.question.strip()
    if not q or len(q) > 1000:
        raise HTTPException(400, "Question must be between 1 and 1000 characters.")
    if not LLM_URL:
        raise HTTPException(503, "AI server address is not set yet (LLM_BASE_URL).")
    mine = DOCS.get(cid, {})
    if body.source == "docs" and not mine:
        raise HTTPException(400, "Add a document first (the + button), or switch to Auto or Web.")

    now = time.time()
    recent = [t for t in ASKS.get(cid, []) if now - t < 3600]
    if len(recent) >= ASKS_PER_HOUR:
        raise HTTPException(429, "Too many questions this hour. Please try again later.")
    ASKS[cid] = recent + [now]

    deep = body.mode == "research"
    today = time.strftime("%B %d, %Y")
    history = body.history[-6:]

    async with httpx.AsyncClient(timeout=120) as http:
        route, query = await decide(http, q, history, bool(mine))
        if body.source == "docs":
            route = "DOCS"
        elif body.source == "web":
            route = "WEB"
        elif route == "DOCS" and not mine:
            route = "WEB"

        sources, src = [], []
        if route == "DOCS":
            items = [{"doc_id": d, "doc_name": doc["name"], **c} for d, doc in mine.items() for c in doc["chunks"]]
            hits = rag.search(q + " " + query, items, 8 if deep else 4)
            if not hits and body.source == "auto":
                route = "WEB"
            elif not hits:
                return {"text": "I could not find this in your documents.", "src": [], "meta": {"route": "docs", "query": query}}
            else:
                sources = [{"label": f"{h['doc_name']}, page {h['page']}", "text": h["text"]} for h in hits]
                src = [{"t": h["doc_name"], "s": f"Page {h['page']}", "q": h["text"][:200] + "..."} for h in hits]
        if route == "WEB":
            try:
                found = await web.gather(q, query, deep)
            except RuntimeError as e:
                raise HTTPException(502, str(e))
            sources = [{"label": f"{f['title']} ({urlparse(f['url']).netloc})", "text": f["text"]} for f in found]
            src = [{"t": f["title"], "s": urlparse(f["url"]).netloc, "url": f["url"], "q": f["text"][:200] + "..."} for f in found]

        text = await llm(http, build_messages(q, sources, body.style, history, today),
                         700 if body.style == "Short" else 1300)
    return {"text": text, "src": src, "meta": {"route": route.lower(), "query": query}}
