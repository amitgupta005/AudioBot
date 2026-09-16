# backend/app/audio/stt.py

import logging
from groq import Groq
from app.config import GROQ_API_KEY

logger = logging.getLogger(__name__)


class SpeechToText:
    """
    Converts audio bytes to text using Groq Whisper (whisper-large-v3-turbo).
    Free tier: 28,800 audio seconds/day (~480 min/day).
    """

    def __init__(self, language_code: str = "en"):
        logger.info("Initializing Groq Whisper STT client...")
        if not GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY is not set in environment variables.")
        self.client = Groq(api_key=GROQ_API_KEY)
        # Groq uses ISO-639-1 codes (e.g. "en"), strip region suffix if passed
        self.default_language = language_code.split("-")[0]
        logger.info("Groq Whisper STT client initialized.")

    def transcribe(self, audio_bytes: bytes, language: str = None) -> str:
        logger.info("Starting transcription via Groq Whisper...")
        lang = (language or self.default_language).split("-")[0]
        try:
            # Groq expects a file-like tuple: (filename, bytes, mime_type)
            # Browser sends WebM/Opus; Groq Whisper auto-detects format.
            transcription = self.client.audio.transcriptions.create(
                file=("audio.webm", audio_bytes, "audio/webm"),
                model="whisper-large-v3-turbo",
                language=lang,
                response_format="text",
            )
            text = transcription.strip() if isinstance(transcription, str) else (transcription.text or "").strip()
            logger.info("Groq Whisper transcription complete.")
            return text
        except Exception as e:
            error_str = str(e)
            logger.error(f"Groq Whisper transcription error: {error_str}")
            if "too large" in error_str.lower() or "maximum" in error_str.lower():
                raise ValueError("Your audio response exceeded the limit. Please try again with a more concise answer.")
            raise ValueError(f"Speech recognition failed: {error_str}")
