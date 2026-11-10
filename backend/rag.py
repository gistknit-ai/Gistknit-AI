"""GistKnit AI - RAG helpers: read PDF/TXT, split into chunks, find best chunks (BM25)."""
import io
import math
import re
from collections import Counter

CHUNK_CHARS = 900
OVERLAP = 150
TOKEN = re.compile(r"\w+", re.UNICODE)


def tokens(text):
    return [t for t in TOKEN.findall(text.lower()) if len(t) > 1]


def extract_pages(filename, data):
    """Return list of (page_number, text). Raises ValueError for unreadable files."""
    name = filename.lower()
    if name.endswith(".pdf"):
        from pypdf import PdfReader
        try:
            reader = PdfReader(io.BytesIO(data))
            pages = [(i + 1, (p.extract_text() or "").strip()) for i, p in enumerate(reader.pages)]
        except Exception:
            raise ValueError("Could not read this PDF. It may be damaged or password protected.")
    elif name.endswith(".txt"):
        text = data.decode("utf-8", errors="ignore")
        pages = [(1, text.strip())]
    else:
        raise ValueError("Only PDF and TXT files are supported right now.")
    pages = [(n, t) for n, t in pages if t]
    if not pages:
        raise ValueError("No text found. Scanned PDFs (photos of pages) need OCR, which comes later.")
    return pages


def make_chunks(pages):
    chunks = []
    for page, text in pages:
        text = re.sub(r"\s+", " ", text)
        start = 0
        while start < len(text):
            piece = text[start:start + CHUNK_CHARS]
            chunks.append({"page": page, "text": piece, "tf": Counter(tokens(piece))})
            if start + CHUNK_CHARS >= len(text):
                break
            start += CHUNK_CHARS - OVERLAP
    return chunks


def search(question, items, top_k=4):
    """items: list of dicts {doc_id, doc_name, page, text, tf}. Returns best matches (BM25)."""
    q = set(tokens(question))
    if not q or not items:
        return []
    n = len(items)
    avg = sum(sum(i["tf"].values()) for i in items) / n or 1
    df = Counter()
    for i in items:
        for t in q:
            if t in i["tf"]:
                df[t] += 1
    scored = []
    for i in items:
        length = sum(i["tf"].values())
        s = 0.0
        for t in q:
            f = i["tf"].get(t, 0)
            if not f:
                continue
            idf = math.log(1 + (n - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * f * 2.2 / (f + 1.2 * (0.25 + 0.75 * length / avg))
        if s > 0:
            scored.append((s, i))
    scored.sort(key=lambda x: -x[0])
    return [i for _, i in scored[:top_k]]


def build_messages(question, hits, style):
    sources = "\n\n".join(
        f"[{n}] ({h['doc_name']}, page {h['page']})\n{h['text']}" for n, h in enumerate(hits, 1)
    )
    length = "Keep the answer short, 2 to 4 sentences." if style == "Short" else "Give a detailed answer with key points."
    system = (
        "You are GistKnit AI, a research assistant. Answer ONLY from the numbered sources given. "
        "After each claim, add the source number in square brackets, like [1] or [2]. "
        "If the sources do not contain the answer, say clearly that the documents do not say, and do not guess. "
        "Reply in the same language and script the user wrote the question in. " + length
    )
    user = f"Sources:\n{sources}\n\nQuestion: {question}"
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]
