import asyncio
import os
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import dotenv


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.append(BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False


class FakeSegment:
    def __init__(self, text):
        self.text = text


class FakeWhisperModel:
    def __init__(self, model_size, device, compute_type):
        self.args = (model_size, device, compute_type)
        self.calls = []

    def transcribe(self, file_path, language="en"):
        self.calls.append((file_path, language))
        info = types.SimpleNamespace(language=language)
        return [FakeSegment("Hello"), FakeSegment("world")], info


fake_faster_whisper = types.ModuleType("faster_whisper")
fake_faster_whisper.WhisperModel = FakeWhisperModel
sys.modules["faster_whisper"] = fake_faster_whisper


fake_edge_tts = types.ModuleType("edge_tts")
fake_edge_tts.Communicate = None
sys.modules["edge_tts"] = fake_edge_tts

from app.audio.stt import SpeechToText  # noqa: E402
from app.audio.tts import TextToSpeech  # noqa: E402


class FakeCommunicate:
    def __init__(self, text, voice):
        self.text = text
        self.voice = voice

    async def stream(self):
        for chunk in (
            {"type": "audio", "data": b"part-1"},
            {"type": "metadata", "data": b"ignored"},
            {"type": "audio", "data": b"part-2"},
        ):
            yield chunk


class AudioModuleTests(unittest.TestCase):
    def test_stt_transcribe_returns_joined_text_and_cleans_temp_file(self):
        stt = SpeechToText()

        deleted_paths = []
        original_unlink = os.unlink

        def tracking_unlink(path):
            deleted_paths.append(path)
            original_unlink(path)

        with patch("app.audio.stt.os.unlink", side_effect=tracking_unlink):
            text = stt.transcribe(b"wav-bytes")

        self.assertEqual(text, "Hello world")
        self.assertEqual(len(stt.model.calls), 1)
        self.assertEqual(len(deleted_paths), 1)
        self.assertFalse(os.path.exists(deleted_paths[0]))

    def test_tts_clean_text_removes_markdown_and_non_ascii(self):
        tts = TextToSpeech()

        cleaned = tts._clean_text("**Hello**  world  cafe\xe9 \U0001f600")

        self.assertEqual(cleaned, "Hello world cafe")

    def test_tts_synthesize_collects_audio_chunks(self):
        tts = TextToSpeech()

        with patch("app.audio.tts.edge_tts.Communicate", FakeCommunicate):
            audio = asyncio.run(tts.synthesize("Hello"))

        self.assertEqual(audio, b"part-1part-2")

    def test_tts_synthesize_returns_empty_for_blank_cleaned_text(self):
        tts = TextToSpeech()

        audio = asyncio.run(tts.synthesize("\U0001f600"))

        self.assertEqual(audio, b"")


if __name__ == "__main__":
    unittest.main()
