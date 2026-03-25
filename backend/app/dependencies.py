# backend/app/dependencies.py
#
# Singleton module: builds expensive components ONCE.
# Both main.py and websocket.py import from here.

import logging
from app.agent.graph import build_agent
from app.audio.stt import SpeechToText
from app.audio.tts import TextToSpeech

logger = logging.getLogger(__name__)

try:
    agent = build_agent()
    stt = SpeechToText()
    tts = TextToSpeech()
    logger.info("Backend components (Agent, STT, TTS) initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize backend components: {e}")
    raise
