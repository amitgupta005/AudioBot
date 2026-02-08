# backend/app/websocket.py

import json
import logging
from fastapi import WebSocket, WebSocketDisconnect
from app.agent.graph import build_agent
from app.memory.store import MemoryStore
from app.audio.stt import SpeechToText
from app.audio.tts import TextToSpeech

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Build shared components once
try:
    agent = build_agent()
    memory = MemoryStore()
    stt = SpeechToText()
    tts = TextToSpeech()
    logger.info("Backend components (Agent, Memory, STT, TTS) initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize backend components: {e}")
    raise e


async def websocket_handler(websocket: WebSocket):
    """
    WebSocket transport layer supporting both text and audio with persistent memory.
    """
    await websocket.accept()
    logger.info("WebSocket connection accepted.")

    try:
        while True:
            try:
                # Receive control message (expecting JSON)
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

            msg_type = data.get("type", "text")  # Default to text if not specified
            conversation_id = data.get("conversation_id", "default-session")
            user_text = ""

            if msg_type == "text":
                user_text = data.get("message", "")
                if not user_text:
                    await websocket.send_text(json.dumps({"error": "Empty message"}))
                    continue
                logger.info(f"Received text message for conversation {conversation_id}")

            elif msg_type == "audio":
                logger.info(f"Waiting for audio bytes for conversation {conversation_id}...")
                try:
                    # Receive raw audio bytes immediately after the audio signal message
                    audio_bytes = await websocket.receive_bytes()
                    # Speech → Text
                    user_text = stt.transcribe(audio_bytes)
                    logger.info(f"STT Transcribed: '{user_text}'")
                except Exception as e:
                    logger.error(f"STT Error: {e}")
                    await websocket.send_text(json.dumps({"error": "Speech recognition failed"}))
                    continue
            else:
                await websocket.send_text(json.dumps({"error": "Unsupported message type"}))
                continue

            # Process with Agent
            try:
                conversation = memory.get_conversation(conversation_id)
                state = {
                    "user_input": user_text,
                    "conversation": conversation,
                    "intent": None,
                    "output": "",
                }

                result = agent.invoke(state)

                # Persist updated conversation
                memory.save_conversation(
                    conversation_id,
                    result["conversation"],
                )

                # Respond based on input type
                if msg_type == "audio":
                    # Text → Speech
                    logger.info("Synthesizing audio response...")
                    audio_response = tts.synthesize(result["output"])
                    # Send audio back
                    await websocket.send_bytes(audio_response)
                else:
                    # Send text response
                    await websocket.send_text(result["output"])

            except Exception as e:
                logger.error(f"Agent/TTS Error: {e}")
                await websocket.send_text(json.dumps({"error": "Processing failed"}))

    except Exception as e:
        logger.error(f"Unexpected WebSocket error: {e}")
    finally:
        logger.info("WebSocket handler finished.")
