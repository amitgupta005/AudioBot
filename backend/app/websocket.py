# backend/app/websocket.py

import asyncio
import json
import logging
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy import select
from app.dependencies import agent, stt, tts

from app.config import SYSTEM_MESSAGE
from app.core.database import AsyncSessionLocal
from app.core.security import authenticate_websocket_token
from app.models.candidates import Candidate
from app.models.interviews import Interview
from app.models.loading import INTERVIEW_FULL_GRAPH


logger = logging.getLogger(__name__)


async def _ensure_interview_context(interview_id: str):
    """
    Ensures that the LangGraph checkpointer has the mandatory jd_text and resume_text.
    If they are missing, we fetch them from the database once and seed the state.
    """
    config = {"configurable": {"thread_id": interview_id}}

    # Check if we already have context in the checkpointer
    # (sync checkpointer call → run in thread pool)
    current_values = await asyncio.to_thread(_session_channel_values, interview_id)
    if current_values.get("jd_text") and current_values.get("resume_text"):
        return current_values

    logger.info("Injecting missing JD/Resume context from DB for interview %s", interview_id)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Interview).options(*INTERVIEW_FULL_GRAPH).where(Interview.id == interview_id)
        )
        interview = result.scalar_one_or_none()

        if not interview:
            logger.error("Interview %s not found in database.", interview_id)
            return current_values

        new_context = {
            "jd_text": interview.job.raw_job_description,
            "resume_text": interview.candidate.resume_text,
        }

        # Persist to checkpointer (sync call → thread pool)
        try:
            await asyncio.to_thread(agent.update_state, config, new_context)
            logger.info("Successfully seeded checkpointer with context for %s", interview_id)
        except Exception as e:
            logger.warning("agent.update_state failed, using fallback seeding: %s", e)
            await asyncio.to_thread(
                agent.invoke,
                {"system_message": SYSTEM_MESSAGE, **new_context},
                config,
            )

    # Return refreshed values
    return await asyncio.to_thread(_session_channel_values, interview_id)


def _session_channel_values(interview_id: str) -> dict:
    """Read channel values from the checkpointer. Sync — call via to_thread."""
    config = {"configurable": {"thread_id": interview_id}}
    checkpointer = getattr(agent, "checkpointer", None)
    if checkpointer is None or not hasattr(checkpointer, "get_tuple"):
        return {}
    checkpoint_tuple = checkpointer.get_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        return checkpoint_tuple.checkpoint.get("channel_values", {})
    return {}


def _serialize_conversation(conversation: list | None) -> list[dict]:
    serialized: list[dict] = []
    for message in conversation or []:
        serialized.append({
            "type": getattr(message, "type", "unknown"),
            "content": getattr(message, "content", str(message)),
        })
    return serialized


async def _mark_interview_completed(interview_id: str, result: dict):
    async with AsyncSessionLocal() as db:
        interview_result = await db.execute(
            select(Interview).options(*INTERVIEW_FULL_GRAPH).where(Interview.id == interview_id)
        )
        interview = interview_result.scalar_one_or_none()
        if not interview:
            logger.warning("Interview %s not found while marking completion.", interview_id)
            return

        interview.status = "completed"
        interview.completed_at = datetime.now(timezone.utc)
        if result.get("candidate_report"):
            interview.report = result.get("candidate_report")
            interview.summary = (result.get("candidate_report") or {}).get("summary")
        if result.get("conversation"):
            interview.transcript = _serialize_conversation(result.get("conversation"))

        candidate_result = await db.execute(
            select(Candidate).where(Candidate.id == interview.candidate_id)
        )
        candidate = candidate_result.scalar_one_or_none()
        if candidate:
            candidate.status = "completed"

        await db.commit()
        logger.info("Marked interview and candidate as completed for %s.", interview_id)


async def websocket_handler(websocket: WebSocket, interview_id: str):
    """
    WebSocket transport layer supporting both text and audio with persistent memory via LangGraph.

    Authentication: The client must pass a valid JWT token as a query parameter:
        ws://host/api/v1/interviews/{id}/stream?token=<jwt>
    Unauthenticated connections are rejected before accept().
    """
    # --- Authenticate before accepting the connection ---
    user = await authenticate_websocket_token(websocket)
    if user is None:
        return  # Socket already closed by authenticate_websocket_token

    await websocket.accept()
    logger.info("WebSocket connection accepted for user %s (interview %s).", user.email, interview_id)

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
                logger.error("Error receiving message: %s", e)
                break

            msg_type = data.get("type", "text")
            user_text = ""
            # Ensure the AI has JD and Resume context before processing
            channel_values = await _ensure_interview_context(interview_id)

            if channel_values.get("interview_complete"):
                await websocket.send_text(json.dumps({
                    "error": "This interview has already ended. Start a new session to continue.",
                    "type": "interview_complete",
                    "interview_complete": True,
                    "report_download_url": channel_values.get("report_download_url"),
                }))
                continue

            if msg_type == "text":
                user_text = data.get("message", "")
                if not user_text:
                    await websocket.send_text(json.dumps({"error": "Empty message"}))
                    continue
                logger.info("Received text message for interview %s", interview_id)

            elif msg_type == "audio":
                logger.info("Waiting for audio bytes for interview %s...", interview_id)
                try:
                    audio_bytes = await websocket.receive_bytes()
                    # STT is a blocking CPU-bound call → run in thread pool
                    user_text = await asyncio.to_thread(stt.transcribe, audio_bytes)
                    logger.info("STT Transcribed: '%s'", user_text)

                    await websocket.send_text(json.dumps({
                        "sender": "You",
                        "text": user_text,
                        "type": "transcription"
                    }))
                except Exception as e:
                    logger.error("STT Error: %s", e)
                    await websocket.send_text(json.dumps({"error": "Speech recognition failed"}))
                    continue
            else:
                await websocket.send_text(json.dumps({"error": "Unsupported message type"}))
                continue

            # Process with LangGraph Agent
            try:
                state = {
                    **channel_values,
                    "user_input": str(user_text),
                    "system_message": channel_values.get("system_message", SYSTEM_MESSAGE),
                    "session_id": interview_id,
                }
                config = {"configurable": {"thread_id": interview_id}}
                # agent.invoke() is a blocking LLM call (2-10s) → run in thread pool
                result = await asyncio.to_thread(agent.invoke, state, config)

                response_text = result.get("output", "I'm sorry, I couldn't process that.")
                await websocket.send_text(json.dumps({
                    "sender": "AI",
                    "text": response_text,
                    "type": "response",
                    "interview_complete": bool(result.get("interview_complete")),
                    "report_download_url": result.get("report_download_url"),
                }))

                if result.get("interview_complete"):
                    try:
                        await _mark_interview_completed(interview_id, result)
                    except Exception as mark_error:
                        logger.error("Failed to persist completion status for %s: %s", interview_id, mark_error)

                if msg_type == "audio" and not result.get("interview_complete"):
                    logger.info("Synthesizing audio response...")
                    audio_response = await tts.synthesize(response_text)
                    if audio_response:
                        await websocket.send_bytes(audio_response)

            except Exception as e:
                logger.error("Agent Error: %s", e)
                await websocket.send_text(json.dumps({"error": f"Processing failed: {str(e)}"}))

    except Exception as e:
        logger.error("Unexpected WebSocket error: %s", e)
    finally:
        logger.info("WebSocket handler finished.")
