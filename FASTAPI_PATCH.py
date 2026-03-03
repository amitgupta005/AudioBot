# ============================================================
# PATCH: Add these changes to your existing FastAPI backend
# to support the Node.js middleware layer.
# ============================================================
# 
# 1. In backend/app/main.py — read Node middleware headers:
#
#    @app.websocket("/ws/audio")
#    async def websocket_endpoint(websocket: WebSocket):
#        # Node middleware injects these headers before proxying
#        user_id    = websocket.headers.get("x-user-id")
#        user_email = websocket.headers.get("x-user-email")
#        session_id = websocket.headers.get("x-session-id")
#        # Use session_id as your Redis key for conversation context
#        await handle_audio(websocket, session_id=session_id)
#
# 2. In backend/app/config.py — add a /config endpoint so Node
#    middleware can push admin config changes:

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from typing import Optional
import os

# Add this to your existing FastAPI app (main.py)

class ConfigUpdate(BaseModel):
    system_prompt: Optional[str] = None
    greeting: Optional[str] = None
    model: Optional[str] = None

# Internal secret shared between Node middleware and FastAPI
INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "change-this-shared-secret")

def register_config_route(app: FastAPI, config):
    """
    Call this in main.py to register the config update endpoint.
    
    Usage in main.py:
        from patches import register_config_route
        register_config_route(app, config)
    """
    @app.post("/internal/config")
    async def update_config(
        updates: ConfigUpdate,
        x_internal_secret: str = Header(None, alias="X-Internal-Secret")
    ):
        if x_internal_secret != INTERNAL_SECRET:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        if updates.system_prompt is not None:
            config.SYSTEM_PROMPT = updates.system_prompt
            os.environ["SYSTEM_PROMPT"] = updates.system_prompt
        
        if updates.greeting is not None:
            config.AI_GREETING = updates.greeting
        
        if updates.model is not None:
            config.GROQ_MODEL = updates.model
        
        return {"status": "ok", "updated": updates.dict(exclude_none=True)}

    @app.get("/internal/health")
    async def internal_health(
        x_internal_secret: str = Header(None, alias="X-Internal-Secret")
    ):
        if x_internal_secret != INTERNAL_SECRET:
            raise HTTPException(status_code=403, detail="Forbidden")
        return {"status": "ok", "service": "fastapi-audiobot"}

# 3. In backend/app/memory/ — your Redis session key should be session_id
#    passed from the header. The Node middleware already manages the 
#    session lifecycle in Redis; FastAPI just uses it for context lookup.
#
#    Recommended: use session_id as your Redis key prefix:
#    key = f"fastapi:context:{session_id}"
#    This namespaces FastAPI Redis keys from Node middleware keys.
