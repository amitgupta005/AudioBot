# backend/app/audio/stt.py

import logging
from google.cloud import speech

logger = logging.getLogger(__name__)


class SpeechToText:
    """
    Converts audio (wav bytes) to text using Google Cloud Speech-to-Text.
    Authenticates automatically via Application Default Credentials.
    """

    def __init__(self, language_code: str = "en-US"):
        logger.info("Initializing Google Cloud Speech client...")
        try:
            self.client = speech.SpeechClient()
            self.default_language = language_code
            logger.info("Google Cloud Speech client initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize Google Cloud Speech client: {e}")
            raise e

    def transcribe(self, audio_bytes: bytes, language: str = None) -> str:
        logger.info("Starting transcription via Google Cloud STT...")
        try:
            audio = speech.RecognitionAudio(content=audio_bytes)
            
            # Since the frontend sends audio in different formats (WebM/Opus or WAV),
            # we don't specify the encoding explicitly so Google can auto-detect it,
            # or we specify default parameters. For best results with browser audio,
            # we often use auto-detection or WEBM_OPUS if specifically sending webm.
            # But the backend currently receives whatever the browser records.
            # Google Cloud STT auto-detects encoding if left out, but sample rate helps.
            config = speech.RecognitionConfig(
                language_code=language or self.default_language,
            )

            response = self.client.recognize(config=config, audio=audio)
            
            text = " ".join(result.alternatives[0].transcript for result in response.results)
            logger.info("Transcription complete.")
            return text.strip()
        except Exception as e:
            logger.error(f"Transcription error: {e}")
            raise e
