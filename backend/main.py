from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://devops-daily.local"],
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)

ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages"

class ProxyRequest(BaseModel):
    model: str
    max_tokens: int
    tools: list
    messages: list

@app.post("/proxy/messages")
async def proxy_messages(req: ProxyRequest):
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            ANTHROPIC_URL,
            headers={
                "Content-Type":         "application/json",
                "x-api-key":            ANTHROPIC_API_KEY,
                "anthropic-version":    "2023-06-01",
            },
            json=req.model_dump(),
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()

@app.get("/health")
def health():
    return {"status": "ok"}