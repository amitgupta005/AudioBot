# backend/app/websocket.py

import json
import logging
from fastapi import WebSocket, WebSocketDisconnect
from app.dependencies import agent, stt, tts
from app.config import SYSTEM_MESSAGE

logger = logging.getLogger(__name__)


def _session_channel_values(conversation_id: str) -> dict:
    config = {"configurable": {"thread_id": conversation_id}}
    checkpointer = getattr(agent, "checkpointer", None)
    if checkpointer is None or not hasattr(checkpointer, "get_tuple"):
        return {}
    checkpoint_tuple = checkpointer.get_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        return checkpoint_tuple.checkpoint.get("channel_values", {})
    return {}


async def websocket_handler(websocket: WebSocket):
    """
    WebSocket transport layer supporting both text and audio with persistent memory via LangGraph.
    """
    await websocket.accept()
    logger.info("WebSocket connection accepted.")

    try:
        while True:
            try:
                raw = await websocket.receive_text()
                data = json.loads(raw)
            except WebSocketDisconnect:
                logger.info("WebSocket disconnected.")
                break
            except json.JSONDecodeError:
                logger.warning("Received invalid JSON payload.")
                await websocket.send_text(json.dumps({"error": "Invalid JSON"}))
                continue
            except Exception as e:
                logger.error(f"Error receiving message: {e}")
                break

            msg_type = data.get("type", "text")
            conversation_id = data.get("conversation_id", "default-session")
            user_text = ""
            channel_values = _session_channel_values(conversation_id)

            if channel_values.get("interview_complete"):
                await websocket.send_text(json.dumps({
                    "error": "This interview has already ended. Start a new session to continue.",
                    "type": "interview_complete",
                    "interview_complete": True,
                    "completion_reason": channel_values.get("completion_reason"),
                    "report_status": channel_values.get("report_status"),
                    "report_download_url": channel_values.get("report_download_url"),
                }))
                continue

            if msg_type == "text":
                user_text = data.get("message", "")
                if not user_text:
                    await websocket.send_text(json.dumps({"error": "Empty message"}))
                    continue
                logger.info(f"Received text message for conversation {conversation_id}")

            elif msg_type == "audio":
                logger.info(f"Waiting for audio bytes for conversation {conversation_id}...")
                try:
                    audio_bytes = await websocket.receive_bytes()
                    user_text = stt.transcribe(audio_bytes)
                    logger.info(f"STT Transcribed: '{user_text}'")

                    await websocket.send_text(json.dumps({
                        "sender": "You",
                        "text": user_text,
                        "type": "transcription"
                    }))
                except Exception as e:
                    logger.error(f"STT Error: {e}")
                    await websocket.send_text(json.dumps({"error": "Speech recognition failed"}))
                    continue
            else:
                await websocket.send_text(json.dumps({"error": "Unsupported message type"}))
                continue

            # Process with LangGraph Agent
            try:
                state = {
                    "user_input": str(user_text),
                    "system_message": SYSTEM_MESSAGE,
                    "session_id": conversation_id,
                }
                config = {"configurable": {"thread_id": conversation_id}}
                result = agent.invoke(state, config=config)

                response_text = result.get("output", "I'm sorry, I couldn't process that.")
                await websocket.send_text(json.dumps({
                    "sender": "AI",
                    "text": response_text,
                    "type": "response",
                    "interview_complete": bool(result.get("interview_complete")),
                    "completion_reason": result.get("completion_reason"),
                    "report_status": result.get("report_status"),
                    "report_download_url": result.get("report_download_url"),
                }))

                if msg_type == "audio" and not result.get("interview_complete"):
                    logger.info("Synthesizing audio response...")
                    audio_response = await tts.synthesize(response_text)
                    if audio_response:
                        await websocket.send_bytes(audio_response)

            except Exception as e:
                logger.error(f"Agent Error: {e}")
                await websocket.send_text(json.dumps({"error": f"Processing failed: {str(e)}"}))

    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
    finally:
        logger.info("WebSocket handler finished.")
