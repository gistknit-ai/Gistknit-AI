"""GistKnit AI - web research helpers: search the web, read pages, pick the best passages."""
import asyncio
import ipaddress
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

import rag

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; GistKnitBot/0.1)", "Accept-Language": "en,hi;q=0.8"}
SKIP_TAGS = {"script", "style", "noscript", "svg", "nav", "footer", "header", "form", "aside"}


class _Text(HTMLParser):
    def __init__(self):
        super().__init__()
        self.out = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in SKIP_TAGS:
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in SKIP_TAGS and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            s = data.strip()
            if s:
                self.out.append(s)


def html_to_text(html):
    p = _Text()
    try:
        p.feed(html)
    except Exception:
        pass
    return re.sub(r"\s+", " ", " ".join(p.out))


def safe_url(url):
    try:
        u = urlparse(url)
    except Exception:
        return False
    if u.scheme not in ("http", "https") or not u.hostname:
        return False
    host = u.hostname.lower()
    if host == "localhost" or host.endswith(".local") or host.endswith(".internal"):
        return False
    try:
        return ipaddress.ip_address(host).is_global
    except ValueError:
        return True  # normal domain name


def _ddg(query, n):
    from ddgs import DDGS
    return [{"title": r.get("title"), "url": r.get("href") or r.get("url"), "body": r.get("body")}
            for r in DDGS().text(query, max_results=n)]


def parse_news(xml_bytes, n):
    root = ET.fromstring(xml_bytes)
    out = []
    for it in list(root.iter("item"))[:n]:
        title = it.findtext("title") or ""
        src = it.findtext("source") or ""
        desc = html_to_text(it.findtext("description") or "")
        out.append({"title": title, "url": it.findtext("link") or "", "body": (title + ". " + (src + ". " if src else "") + desc)[:600]})
    return out


def _gnews(query, n):
    url = "https://news.google.com/rss/search?q=" + urllib.parse.quote(query) + "&hl=en-IN&gl=IN&ceid=IN:en"
    data = urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=8).read()
    return parse_news(data, n)


def parse_wiki(data, lang):
    pages = sorted(data.get("query", {}).get("pages", []), key=lambda p: p.get("index", 99))
    return [{"title": p.get("title", ""), "url": f"https://{lang}.wikipedia.org/?curid={p['pageid']}", "body": p.get("extract", "")}
            for p in pages if p.get("pageid")]


def _wiki(query, n):
    lang = "hi" if re.search(r"[\u0900-\u097F]", query) else "en"
    params = urllib.parse.urlencode({"action": "query", "generator": "search", "gsrsearch": query, "gsrlimit": n,
                                     "prop": "extracts", "exintro": 1, "explaintext": 1, "exchars": 1500,
                                     "format": "json", "formatversion": 2})
    url = f"https://{lang}.wikipedia.org/w/api.php?{params}"
    data = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=8).read())
    return parse_wiki(data, lang)


async def web_search(query, n=6):
    """Try DuckDuckGo first, then Google News, then Wikipedia. First one that returns results wins."""
    for provider in (_ddg, _gnews, _wiki):
        try:
            res = await asyncio.to_thread(provider, query, n)
        except Exception:
            continue
        out = []
        for r in res or []:
            url = r.get("url") or ""
            if safe_url(url):
                out.append({"title": (r.get("title") or url)[:160], "url": url, "snippet": (r.get("body") or "")[:1500]})
        if out:
            return out
    raise RuntimeError("web_unavailable")


async def fetch_text(client, url):
    try:
        r = await client.get(url)
        ct = r.headers.get("content-type", "")
        if r.status_code != 200 or ("html" not in ct and "text" not in ct):
            return ""
        return html_to_text(r.text[:600000])
    except Exception:
        return ""


async def gather(question, query, deep):
    """Search the web, read the top pages, return the best sources: [{title,url,text,snippet}]."""
    results = await web_search(query, 8 if deep else 6)
    if not results:
        raise RuntimeError("No web results found for this question.")
    fetch_n = len(results) if deep else min(4, len(results))
    async with httpx.AsyncClient(timeout=8, follow_redirects=True, headers=HEADERS) as client:
        texts = await asyncio.gather(*[fetch_text(client, r["url"]) for r in results[:fetch_n]])
    items = []
    for i, r in enumerate(results):
        text = texts[i] if i < len(texts) else ""
        body = text if len(text) > 200 else r["snippet"]
        if not body:
            continue
        for ch in rag.make_chunks([(1, body[:50000])]):
            items.append({"url": r["url"], "title": r["title"], **ch})
    hits = rag.search(question + " " + query, items, 14 if deep else 8)
    by, order = {}, []
    for h in hits:
        if h["url"] not in by:
            by[h["url"]] = {"title": h["title"], "url": h["url"], "texts": []}
            order.append(h["url"])
        if len(by[h["url"]]["texts"]) < 2:
            by[h["url"]]["texts"].append(h["text"])
    limit = 8 if deep else 5
    out = [{"title": by[u]["title"], "url": u, "text": " ".join(by[u]["texts"])} for u in order[:limit]]
    if not out:  # nothing matched: fall back to the search snippets
        out = [{"title": r["title"], "url": r["url"], "text": r["snippet"]} for r in results[:limit] if r["snippet"]]
    return out
