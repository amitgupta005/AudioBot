# backend/app/main.py

from fastapi import FastAPI, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.websocket import websocket_handler
from app.config import APP_NAME, APP_VERSION
from app.memory.store import MemoryStore

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

memory = MemoryStore()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_handler(websocket)


# -----------------------
# Admin API (Read-only)
# -----------------------

@app.get("/admin/conversations")
def list_conversations():
    """
    Returns all known conversation IDs.
    """
    return {
        "conversations": memory.list_conversations()
    }


@app.get("/admin/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    """
    Returns the conversation history for a given ID.
    """
    conversation = memory.get_conversation(conversation_id)

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "conversation_id": conversation_id,
        "messages": conversation
    }

# -----------------------
# Monitoring / Health API
# -----------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/redis")
def health_redis():
    try:
        memory.client.ping()
        return {"redis": "connected"}
    except Exception:
        raise HTTPException(status_code=500, detail="Redis not reachable")


@app.get("/health/llm")
def health_llm():
    try:
        # Minimal LLM ping
        from langchain_groq import ChatGroq
        from app.config import GROQ_MODEL
        llm = ChatGroq(model=GROQ_MODEL)
        llm.invoke("Hi")
        return {"llm": "reachable"}
    except Exception:
        raise HTTPException(status_code=500, detail="LLM not reachable")