# backend/app/audio/stt.py

import os
import logging
import tempfile
from faster_whisper import WhisperModel
from app.config import STT_MODEL

logger = logging.getLogger(__name__)


class SpeechToText:
    """
    Converts audio (wav bytes) to text.
    """

    def __init__(self, model_size: str = STT_MODEL):
        logger.info(f"Initializing Whisper model: {model_size}")
        try:
            self.model = WhisperModel(
                model_size,
                device="cpu",
                compute_type="int8",
            )
            logger.info("Whisper model initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize Whisper model: {e}")
            raise e

    def transcribe(self, audio_bytes: bytes, language: str = "en") -> str:
        logger.info(f"Starting transcription (language={language})...")
        file_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fp:
                fp.write(audio_bytes)
                fp.flush()
                file_path = fp.name

            segments, info = self.model.transcribe(file_path, language=language)
            text = " ".join(segment.text for segment in segments)
            logger.info(f"Transcription complete. Detected language: {info.language}")
            return text.strip()
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            raise e
        finally:
            # Clean up the temp file to prevent leaks
            if file_path and os.path.exists(file_path):
                os.unlink(file_path)
