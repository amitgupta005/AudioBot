# backend/app/audio/tts.py

import logging
from google.cloud import texttospeech
import re

logger = logging.getLogger(__name__)


class TextToSpeech:
    """
    Converts text into spoken audio (mp3/wav) using Google Cloud Text-to-Speech.
    Authenticates automatically via Application Default Credentials.
    """

    def __init__(self, language_code: str = "en-US", voice_name: str = "en-US-Neural2-F"):
        logger.info(f"Initializing Google Cloud TTS with voice: {voice_name}")
        try:
            self.client = texttospeech.TextToSpeechClient()
            self.voice = texttospeech.VoiceSelectionParams(
                language_code=language_code,
                name=voice_name,
            )
            # We use MP3 for optimal web playback
            self.audio_config = texttospeech.AudioConfig(
                audio_encoding=texttospeech.AudioEncoding.MP3
            )
            logger.info("Google Cloud TTS client initialized.")
        except Exception as e:
            logger.error(f"Failed to initialize Google Cloud TTS client: {e}")
            raise e

    def _clean_text(self, text: str) -> str:
        """
        Removes markdown characters and emojis that might disrupt speech.
        """
        # Remove bold/italic markdown (asterisks)
        text = text.replace("**", "").replace("*", "")
        # Remove emojis (common range)
        text = re.sub(r'[^\x00-\x7F]+', '', text)
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text).strip()
        return text

    async def synthesize(self, text: str) -> bytes:
        """
        Synthesizes text to speech bytes using Google Cloud TTS.
        """
        logger.info(f"Synthesizing audio (Google TTS) for: {text[:50]}...")
        cleaned_text = self._clean_text(text)
        
        if not cleaned_text:
            logger.warning("Cleaned text is empty, nothing to synthesize.")
            return b""

        try:
            synthesis_input = texttospeech.SynthesisInput(text=cleaned_text)
            
            # This is a synchronous call in the google-cloud SDK, 
            # but we run it inside an async wrapper. For high throughput,
            # we could use run_in_executor, but this is fast enough for now.
            import asyncio
            response = await asyncio.to_thread(
                self.client.synthesize_speech,
                input=synthesis_input,
                voice=self.voice,
                audio_config=self.audio_config
            )
            
            audio_data = response.audio_content
            logger.info(f"Synthesis complete. Size: {len(audio_data)} bytes")
            return audio_data
        except Exception as e:
            logger.error(f"Synthesis error: {e}")
            return b""
