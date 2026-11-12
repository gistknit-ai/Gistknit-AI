"""GistKnit AI backend (Step 5): human-like streaming chat, photos, coding mode, web research with sources."""
import json
import os
import re
import time
import uuid
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import rag
import web

# Apna model server (Ollama / vLLM). Koi third-party AI company ka API nahi.
LLM_URL = os.environ.get("LLM_BASE_URL", "").rstrip("/")   # example: https://xxxx.ngrok-free.app/v1
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen2.5:7b")
LLM_VISION_MODEL = os.environ.get("LLM_VISION_MODEL", "qwen2.5vl:7b")   # photos samajhne wala model
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
GREET = re.compile(r"^\s*(hi+|hello+|hey+|hlo+|helo|yo|sup|namaste|wassup|what'?s up|how are you|kaise ho|kya haal|thanks?|thank you|ok(ay)?|good (morning|night|evening|afternoon)|bye)\b", re.I)


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
    images: list[str] = []    # photos as data:image/... (max 3)
    code: bool = False        # coding mode


class LLMError(Exception):
    pass


def ev(**k):
    return json.dumps(k, ensure_ascii=False) + "\n"


def llm_error(status, text, vision=False):
    if vision and status == 404:
        return "The photo-reading model is not installed on your AI server yet. Run the photo-model cell in Colab, then try again."
    detail = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", text)).strip()[:160]
    return f"AI server error ({status}). {detail}"


def _headers():
    return {"ngrok-skip-browser-warning": "true", **({"Authorization": f"Bearer {LLM_KEY}"} if LLM_KEY else {})}


async def llm(http, messages, max_tokens=700, temperature=0.2, model=None):
    try:
        r = await http.post(LLM_URL + "/chat/completions", headers=_headers(),
                            json={"model": model or LLM_MODEL, "messages": messages,
                                  "temperature": temperature, "max_tokens": max_tokens})
    except httpx.HTTPError:
        raise LLMError("Could not reach your AI server. Is Colab running?")
    if r.status_code != 200:
        raise LLMError(llm_error(r.status_code, r.text))
    return r.json()["choices"][0]["message"]["content"].strip()


async def llm_stream(http, messages, max_tokens, model, temperature=0.5):
    payload = {"model": model, "messages": messages, "temperature": temperature,
               "max_tokens": max_tokens, "stream": True}
    try:
        async with http.stream("POST", LLM_URL + "/chat/completions", headers=_headers(), json=payload) as r:
            if r.status_code != 200:
                body = (await r.aread()).decode("utf-8", "ignore")
                raise LLMError(llm_error(r.status_code, body, vision=(model == LLM_VISION_MODEL)))
            async for line in r.aiter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    piece = json.loads(data)["choices"][0]["delta"].get("content")
                except Exception:
                    continue
                if piece:
                    yield piece
    except httpx.HTTPError:
        raise LLMError("The AI server stopped responding. Is Colab still running?")


async def decide(http, q, history, has_docs):
    """Ask the model: WEB, DOCS or CHAT, plus a short search query."""
    recent = "\n".join(f"{m.role}: {m.content[:200]}" for m in history[-4:]) or "(none)"
    prompt = (
        "You route a user's message for an AI assistant. Reply with exactly two lines.\n"
        "Line 1, one word: WEB only if answering needs fresh or factual info from the internet "
        "(news, prices, recent events, real people, products, research, 'latest', 'sources'). "
        "DOCS only if the user has uploaded documents and is asking about them. "
        "Otherwise CHAT (greetings, casual talk, advice, writing, coding, maths, explaining well-known things).\n"
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
        route = "CHAT"
    return route, (query or q)[:200]


PERSONA = (
    "You are GistKnit AI, a smart and warm assistant created by Founder Ved Prakash. "
    "Talk like a real, friendly person: natural and conversational, not robotic or formal. "
    "Reply in the same language and script the user writes in (Hindi, Hinglish or English). "
    "You are strong at coding: when asked for code, give complete, working code in fenced code blocks "
    "with the language name, then a short plain explanation. "
    "If asked who made you, say you are GistKnit AI, created by Founder Ved Prakash. "
    "If asked about the AI model under the hood, say you run on an open-source language model. "
    "Never invent facts; if you do not know something, say so honestly."
)


def build_messages(question, sources, style, history, today, images, code=False):
    tone = "Keep it concise." if style == "Short" else "Be thorough and well organised."
    if sources:
        system = (f"{PERSONA} Today is {today}. For this question, answer ONLY from the numbered sources below. "
                  "After each claim add the source number in square brackets, like [1] or [2]. "
                  f"If the sources do not contain the answer, say clearly what is missing. {tone}")
    else:
        system = (f"{PERSONA} Today is {today}. You are not searching the internet in this reply. "
                  "Do not talk about documents or sources unless the user brings them up. "
                  f"If the user needs current facts, tell them you can search the web for it. {tone}")
    if code:
        system += (" The user is in coding mode: write clean, complete, working code in fenced code blocks with the language name, "
                   "explain it briefly in plain words, and say how to run it. If the request is unclear, ask one short question.")
    msgs = [{"role": "system", "content": system}]
    for m in history[-6:]:
        role = "assistant" if m.role in ("assistant", "a") else "user"
        msgs.append({"role": role, "content": re.sub(r"\[\d+\]", "", m.content)[:800]})
    if sources:
        block = "\n\n".join(f"[{n}] {s['label']}\n{s['text']}" for n, s in enumerate(sources, 1))
        text = f"Sources:\n{block}\n\nQuestion: {question}"
    else:
        text = question
    if images:
        content = [{"type": "text", "text": text}] + [{"type": "image_url", "image_url": {"url": u}} for u in images]
        msgs.append({"role": "user", "content": content})
    else:
        msgs.append({"role": "user", "content": text})
    return msgs


async def run(body, mine, q):
    deep = body.mode == "research"
    today = time.strftime("%B %d, %Y")
    history = body.history[-6:]
    has_img = bool(body.images)
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(180.0, connect=15.0)) as http:
            if has_img or (body.code and body.source == "auto"):
                route, query = "CHAT", q
            else:
                yield ev(type="status", text="Thinking")
                route, query = await decide(http, q, history, bool(mine))
                if body.source == "docs":
                    route = "DOCS"
                elif body.source == "web":
                    route = "WEB"
                elif GREET.match(q):
                    route = "CHAT"
                elif route == "DOCS" and not mine:
                    route = "CHAT"

            sources, src, notice = [], [], ""
            if route == "DOCS":
                yield ev(type="status", text="Reading your documents")
                items = [{"doc_id": d, "doc_name": doc["name"], **c} for d, doc in mine.items() for c in doc["chunks"]]
                hits = rag.search(q + " " + query, items, 8 if deep else 4)
                if not hits and body.source == "auto":
                    route = "CHAT"
                elif not hits:
                    yield ev(type="meta", route="docs", query=query, src=[])
                    yield ev(type="delta", text="I could not find this in your documents.")
                    yield ev(type="done")
                    return
                else:
                    sources = [{"label": f"{h['doc_name']}, page {h['page']}", "text": h["text"]} for h in hits]
                    src = [{"t": h["doc_name"], "s": f"Page {h['page']}", "q": h["text"][:200] + "..."} for h in hits]
            if route == "WEB":
                yield ev(type="status", text=f"Searching the web: {query}")
                try:
                    found = await web.gather(q, query, deep)
                except RuntimeError:
                    found = None
                if found is None:
                    route = "CHAT"
                    notice = "*I could not reach the web right now, so this answer comes from my own knowledge and may be out of date.*\n\n"
                else:
                    sources = [{"label": f"{f['title']} ({urlparse(f['url']).netloc})", "text": f["text"]} for f in found]
                    src = [{"t": f["title"], "s": urlparse(f["url"]).netloc, "url": f["url"], "q": f["text"][:200] + "..."} for f in found]

            yield ev(type="meta", route=route.lower(), query=query, src=src)
            if notice:
                yield ev(type="delta", text=notice)
            msgs = build_messages(q, sources, body.style, history, today, body.images, body.code)
            model = LLM_VISION_MODEL if has_img else LLM_MODEL
            max_tokens = 2200 if body.code else (1200 if body.style == "Short" else 2000)
            async for piece in llm_stream(http, msgs, max_tokens, model, 0.3 if body.code else 0.5):
                yield ev(type="delta", text=piece)
            yield ev(type="done")
    except LLMError as e:
        yield ev(type="error", text=str(e))
    except RuntimeError as e:
        yield ev(type="error", text=str(e))
    except httpx.HTTPError:
        yield ev(type="error", text="Could not reach your AI server. Is Colab running?")
    except Exception:
        yield ev(type="error", text="Something went wrong on the server. Please try again.")


@app.post("/ask")
async def ask(body: AskBody, x_client_id: str = Header(None)):
    cid = client(x_client_id)
    q = body.question.strip()
    if not q or len(q) > 1500:
        raise HTTPException(400, "Message must be between 1 and 1500 characters.")
    if not LLM_URL:
        raise HTTPException(503, "AI server address is not set yet (LLM_BASE_URL).")
    if len(body.images) > 3 or any((not u.startswith("data:image/")) or len(u) > 2_500_000 for u in body.images):
        raise HTTPException(400, "Up to 3 photos, each under about 1.8 MB.")
    mine = DOCS.get(cid, {})
    if body.source == "docs" and not mine:
        raise HTTPException(400, "Add a document first (the + button), or switch to Auto or Web.")
    now = time.time()
    recent = [t for t in ASKS.get(cid, []) if now - t < 3600]
    if len(recent) >= ASKS_PER_HOUR:
        raise HTTPException(429, "Too many messages this hour. Please try again later.")
    ASKS[cid] = recent + [now]
    return StreamingResponse(run(body, mine, q), media_type="application/x-ndjson",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
