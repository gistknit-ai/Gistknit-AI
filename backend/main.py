from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="GistKnit AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {
        "name": "GistKnit AI",
        "status": "running"
    }

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "ai_engine": "not_connected",
        "rag_engine": "not_connected",
        "research_engine": "not_connected"
    }
