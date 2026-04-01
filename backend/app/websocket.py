# backend/app/websocket.py

import json
import logging
import httpx
from fastapi import WebSocket, WebSocketDisconnect
from app.dependencies import agent, stt, tts
from app.config import SYSTEM_MESSAGE

logger = logging.getLogger(__name__)

# Node-middleware internal API URL
MIDDLEWARE_URL = "http://localhost:3001"  # Adjust if running on different port


def _session_channel_values(conversation_id: str) -> dict:
    config = {"configurable": {"thread_id": conversation_id}}
    checkpointer = getattr(agent, "checkpointer", None)
    if checkpointer is None or not hasattr(checkpointer, "get_tuple"):
        return {}
    checkpoint_tuple = checkpointer.get_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        return checkpoint_tuple.checkpoint.get("channel_values", {})
    return {}


async def _sync_message_to_middleware(session_id: str, role: str, content: str, jobId: str = None):
    """Send message to node-middleware for MongoDB persistence."""
    try:
        async with httpx.AsyncClient() as client:
            payload = {
                "sessionId": session_id,
                "role": role,
                "content": content,
                "type": "text"
            }
            if jobId:
                payload["jobId"] = jobId
            await client.post(
                f"{MIDDLEWARE_URL}/conversations/internal/sync-message",
                json=payload,
                timeout=5.0
            )
    except Exception as e:
        logger.warning(f"Failed to sync message to middleware: {e}")


async def _sync_conversation_to_mongodb(session_id: str, channel_values: dict):
    """Sync complete conversation state from LangGraph to MongoDB."""
    try:
        async with httpx.AsyncClient() as client:
            conversation = channel_values.get("conversation", [])
            
            # Prepare messages for MongoDB
            messages = []
            for msg in conversation:
                msg_type = getattr(msg, "type", "unknown")
                msg_content = getattr(msg, "content", str(msg))
                
                # Skip system initialization markers
                if msg_content == "SYSTEM_INITIALIZATION":
                    continue
                    
                # Only include human and assistant messages
                if msg_type in ["human", "assistant"]:
                    messages.append({
                        "role": "user" if msg_type == "human" else "assistant",
                        "content": msg_content,
                        "type": "text"
                    })
            
            # Sync to middleware if there are messages
            if messages:
                logger.info(f"🔄 Syncing {len(messages)} messages from Redis to MongoDB for {session_id}")
                await client.post(
                    f"{MIDDLEWARE_URL}/conversations/internal/sync-full-conversation",
                    json={
                        "sessionId": session_id,
                        "messages": messages,
                        "source": "python_backend"
                    },
                    timeout=5.0
                )
                logger.info(f"✅ Synced {len(messages)} messages to MongoDB for {session_id}")
            else:
                logger.debug(f"ℹ️  No messages to sync for {session_id}")
    except Exception as e:
        logger.warning(f"Failed to sync conversation to MongoDB: {e}")


async def _sync_conversation_end_to_middleware(session_id: str, completion_reason: str = "completed"):
    """Sync conversation end status to MongoDB."""
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{MIDDLEWARE_URL}/conversations/internal/sync-conversation-end",
                json={
                    "sessionId": session_id,
                    "completionReason": completion_reason
                },
                timeout=5.0
            )
            logger.info(f"✅ Marked conversation {session_id} as complete: {completion_reason}")
    except Exception as e:
        logger.warning(f"Failed to sync conversation end to middleware: {e}")


async def websocket_handler(websocket: WebSocket):
    """
    WebSocket transport layer supporting both text and audio with persistent memory via LangGraph.
    """
    await websocket.accept()
    logger.info("WebSocket connection accepted.")

    # Extract jobId from query params
    query_params = websocket.query_params
    jobId = query_params.get("jobId")
    if jobId:
        logger.info(f"WebSocket connected with jobId: {jobId}")

    # Track if we've synced initial messages for this connection
    synced_convos = set()

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
            
            # On first message from user for this conversation, sync any initial messages
            if conversation_id not in synced_convos:
                await _sync_conversation_to_mongodb(conversation_id, channel_values)
                synced_convos.add(conversation_id)

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
                # Sync user message to middleware with jobId
                await _sync_message_to_middleware(conversation_id, "user", user_text, jobId)

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
                    # Sync transcribed message to middleware
                    await _sync_message_to_middleware(conversation_id, "user", user_text)
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
                
                # Sync bot response to middleware
                await _sync_message_to_middleware(conversation_id, "assistant", response_text)
                
                # Fetch UPDATED checkpoint from Redis after processing and sync all messages
                updated_channel_values = _session_channel_values(conversation_id)
                await _sync_conversation_to_mongodb(conversation_id, updated_channel_values)
                
                # If interview is complete, sync end status
                if result.get("interview_complete"):
                    await _sync_conversation_end_to_middleware(conversation_id, result.get("completion_reason", "completed"))

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
