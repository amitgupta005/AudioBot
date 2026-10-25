"""
Tests for the audio modules (app/audio/stt.py, app/audio/tts.py).

Both providers are faked, so these run with no API keys and no cloud
credentials:
  - STT is Groq Whisper (`whisper-large-v3-turbo`)
  - TTS is Google Cloud Text-to-Speech

Note for future edits: an earlier version of this file stubbed `faster_whisper`
and `edge_tts`. Neither is used any more; do not reintroduce those stubs.
"""

import asyncio
import os
import sys
import unittest
from unittest.mock import patch

import dotenv

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.append(BACKEND_ROOT)

# Keep the suite independent of any local .env file.
dotenv.load_dotenv = lambda *args, **kwargs: False

from app.audio.stt import SpeechToText  # noqa: E402
from app.audio.tts import TextToSpeech  # noqa: E402


# =====================================================
# Groq STT fakes
# =====================================================

class FakeTranscriptions:
    def __init__(self, result="  Hello world  ", error=None):
        self.result = result
        self.error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


class FakeGroq:
    """Stands in for groq.Groq. Construction must not perform any network I/O."""

    last_instance = None

    def __init__(self, api_key=None):
        self.api_key = api_key
        self.audio = type("FakeAudio", (), {})()
        self.audio.transcriptions = FakeTranscriptions()
        FakeGroq.last_instance = self


# =====================================================
# Google TTS fakes
# =====================================================

class FakeTtsResponse:
    audio_content = b"mp3-bytes"


class FakeTtsClient:
    last_instance = None

    def __init__(self):
        self.calls = []
        FakeTtsClient.last_instance = self

    def synthesize_speech(self, input=None, voice=None, audio_config=None):
        self.calls.append({"input": input, "voice": voice, "audio_config": audio_config})
        return FakeTtsResponse()


class SpeechToTextTests(unittest.TestCase):
    def test_transcribe_returns_stripped_text(self):
        with patch("app.audio.stt.GROQ_API_KEY", "test-key"), \
             patch("app.audio.stt.Groq", FakeGroq):
            stt = SpeechToText()
            text = stt.transcribe(b"audio-bytes")

        self.assertEqual(text, "Hello world")

    def test_transcribe_sends_expected_model_and_language(self):
        with patch("app.audio.stt.GROQ_API_KEY", "test-key"), \
             patch("app.audio.stt.Groq", FakeGroq):
            stt = SpeechToText()
            stt.transcribe(b"audio-bytes")

        call = FakeGroq.last_instance.audio.transcriptions.calls[0]
        self.assertEqual(call["model"], "whisper-large-v3-turbo")
        self.assertEqual(call["language"], "en")
        self.assertEqual(call["response_format"], "text")

    def test_region_suffix_is_stripped_from_language(self):
        """Groq expects ISO-639-1 ("en"), not a locale ("en-US")."""
        with patch("app.audio.stt.GROQ_API_KEY", "test-key"), \
             patch("app.audio.stt.Groq", FakeGroq):
            stt = SpeechToText("en-US")
            stt.transcribe(b"audio-bytes", language="en-GB")

        self.assertEqual(stt.default_language, "en")
        self.assertEqual(FakeGroq.last_instance.audio.transcriptions.calls[0]["language"], "en")

    def test_missing_api_key_raises_on_construction(self):
        """Fail fast at startup rather than on the first voice message."""
        with patch("app.audio.stt.GROQ_API_KEY", None):
            with self.assertRaises(RuntimeError):
                SpeechToText()

    def test_oversized_audio_raises_friendly_value_error(self):
        with patch("app.audio.stt.GROQ_API_KEY", "test-key"), \
             patch("app.audio.stt.Groq", FakeGroq):
            stt = SpeechToText()
            stt.client.audio.transcriptions = FakeTranscriptions(
                error=Exception("request entity too large")
            )
            with self.assertRaises(ValueError) as ctx:
                stt.transcribe(b"audio-bytes")

        self.assertIn("exceeded the limit", str(ctx.exception))


class TextToSpeechTests(unittest.TestCase):
    def test_synthesize_returns_audio_bytes(self):
        with patch("app.audio.tts.texttospeech.TextToSpeechClient", FakeTtsClient):
            tts = TextToSpeech()
            audio = asyncio.run(tts.synthesize("Hello"))

        self.assertEqual(audio, b"mp3-bytes")
        self.assertEqual(len(FakeTtsClient.last_instance.calls), 1)

    def test_clean_text_removes_markdown_and_non_ascii(self):
        with patch("app.audio.tts.texttospeech.TextToSpeechClient", FakeTtsClient):
            tts = TextToSpeech()

        cleaned = tts._clean_text("**Hello**  world  cafe\xe9 \U0001f600")

        self.assertEqual(cleaned, "Hello world cafe")

    def test_synthesize_returns_empty_for_blank_cleaned_text(self):
        """Emoji-only input cleans to an empty string, so skip the API call."""
        with patch("app.audio.tts.texttospeech.TextToSpeechClient", FakeTtsClient):
            tts = TextToSpeech()
            audio = asyncio.run(tts.synthesize("\U0001f600"))

        self.assertEqual(audio, b"")
        self.assertEqual(FakeTtsClient.last_instance.calls, [])

    def test_synthesis_failure_returns_empty_bytes(self):
        """A TTS outage must not break the interview turn."""
        with patch("app.audio.tts.texttospeech.TextToSpeechClient", FakeTtsClient):
            tts = TextToSpeech()

            def boom(**kwargs):
                raise RuntimeError("tts unavailable")

            tts.client.synthesize_speech = boom
            audio = asyncio.run(tts.synthesize("Hello"))

        self.assertEqual(audio, b"")


if __name__ == "__main__":
    unittest.main()
