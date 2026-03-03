# backend/app/audio/tts.py

import logging
import edge_tts
import io
from app.config import TTS_MODEL

logger = logging.getLogger(__name__)


class TextToSpeech:
    """
    Converts text into spoken audio (mp3/wav) using edge-tts.
    """

    def __init__(self, voice: str = TTS_MODEL):
        self.voice = voice
        logger.info(f"Initialized TTS with voice: {self.voice}")

    def _clean_text(self, text: str) -> str:
        """
        Removes markdown characters and emojis that might disrupt speech.
        """
        import re
        # Remove bold/italic markdown (asterisks)
        text = text.replace("**", "").replace("*", "")
        # Remove emojis (common range)
        text = re.sub(r'[^\x00-\x7F]+', '', text)
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    async def synthesize(self, text: str) -> bytes:
        """
        Synthesizes text to speech bytes using edge-tts.
        """
        logger.info(f"Synthesizing audio (edge-tts) for: {text[:50]}...")
        cleaned_text = self._clean_text(text)
        
        if not cleaned_text:
            logger.warning("Cleaned text is empty, nothing to synthesize.")
            return b""

        try:
            communicate = edge_tts.Communicate(cleaned_text, self.voice)
            audio_stream = io.BytesIO()
            
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_stream.write(chunk["data"])
            
            audio_data = audio_stream.getvalue()
            logger.info(f"Synthesis complete. Size: {len(audio_data)} bytes")
            return audio_data
        except Exception as e:
            logger.error(f"Synthesis error: {e}")
            return b""
