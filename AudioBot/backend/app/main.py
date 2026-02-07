# backend/app/main.py

from fastapi import FastAPI, WebSocket
from app.websocket import websocket_handler
from app.config import APP_NAME, APP_VERSION

app = FastAPI(title=APP_NAME, version=APP_VERSION)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_handler(websocket)
