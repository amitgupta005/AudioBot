# backend/app/audio/tts.py

import logging
import tempfile
from TTS.api import TTS
from app.config import TTS_MODEL

logger = logging.getLogger(__name__)


class TextToSpeech:
    """
    Converts text into spoken audio (wav bytes).
    """

    def __init__(self, model_name: str = TTS_MODEL):
        logger.info(f"Initializing TTS model: {model_name}")
        try:
            self.tts = TTS(model_name=model_name)
            logger.info("TTS model initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize TTS model: {e}")
            raise e

    def _clean_text(self, text: str) -> str:
        """
        Removes markdown characters and emojis that cause TTS to crash.
        """
        import re
        # Remove bold/italic markdown (asterisks)
        text = text.replace("**", "").replace("*", "")
        # Remove emojis (common range)
        text = re.sub(r'[^\x00-\x7F]+', '', text)
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    def synthesize(self, text: str) -> bytes:
        logger.info(f"Synthesizing audio for: {text[:50]}...")
        cleaned_text = self._clean_text(text)
        
        if not cleaned_text:
            logger.warning("Cleaned text is empty, nothing to synthesize.")
            return b""

        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as fp:
                temp_path = fp.name
            
            self.tts.tts_to_file(text=cleaned_text, file_path=temp_path)
            
            with open(temp_path, "rb") as f:
                audio_data = f.read()
            
            logger.info(f"Synthesis complete. Size: {len(audio_data)} bytes")
            return audio_data
        except Exception as e:
            logger.error(f"Synthesis error: {e}")
            raise e
