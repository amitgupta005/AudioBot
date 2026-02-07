# backend/app/websocket.py

from fastapi import WebSocket
from app.agent.graph import build_agent

# Build agent once at startup
agent = build_agent()


async def websocket_handler(websocket: WebSocket):
    """
    Handles a single WebSocket connection.
    Maintains conversation state for that connection only.
    """
    await websocket.accept()

    conversation = []

    while True:
        # Receive user message
        user_text = await websocket.receive_text()

        # Prepare agent state
        state = {
            "user_input": user_text,
            "conversation": conversation,
            "output": ""
        }

        # Invoke agent
        result = agent.invoke(state)

        # Send response back
        await websocket.send_text(result["output"])
