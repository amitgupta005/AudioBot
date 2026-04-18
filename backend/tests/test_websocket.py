"""
Tests for the WebSocket handler (app/websocket.py).

Updated for the current API:
- websocket_handler now takes (websocket, interview_id)
- JWT auth is enforced before accept()
- Blocking calls wrapped in asyncio.to_thread
- STT/TTS accessed from app.dependencies
"""

import asyncio
import json
import os
import sys
import types
import unittest
from unittest.mock import patch, AsyncMock

import dotenv

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False


class StubAgent:
    def __init__(self):
        self.calls = []
        self.checkpointer = types.SimpleNamespace(get_tuple=lambda _config: None)

    def invoke(self, state, config=None):
        self.calls.append((state, config))
        return {
            "output": "Agent reply",
            "interview_complete": False,
            "report_download_url": None,
        }

    def update_state(self, config, values):
        pass


class StubStt:
    def __init__(self):
        self.calls = []

    def transcribe(self, audio_bytes):
        self.calls.append(audio_bytes)
        return "Transcribed speech"


class StubTts:
    def __init__(self):
        self.calls = []

    async def synthesize(self, text):
        self.calls.append(text)
        return b"audio-reply"


stub_agent = StubAgent()
stub_stt = StubStt()
stub_tts = StubTts()

stub_dependencies = types.ModuleType("app.dependencies")
stub_dependencies.agent = stub_agent
stub_dependencies.stt = stub_stt
stub_dependencies.tts = stub_tts
sys.modules["app.dependencies"] = stub_dependencies


from app.websocket import websocket_handler  # noqa: E402
from fastapi import WebSocketDisconnect  # noqa: E402


class FakeWebSocket:
    """Simulates a FastAPI WebSocket for testing."""

    def __init__(self, text_frames=None, byte_frames=None, query_params=None):
        self.text_frames = list(text_frames or [])
        self.byte_frames = list(byte_frames or [])
        self.sent_texts = []
        self.sent_bytes = []
        self.accepted = False
        self.closed = False
        self.close_code = None
        self.close_reason = None
        # Simulate query_params for JWT auth
        self.query_params = query_params or {}

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        if not self.text_frames:
            raise WebSocketDisconnect()
        return self.text_frames.pop(0)

    async def receive_bytes(self):
        if not self.byte_frames:
            raise RuntimeError("No binary frame available")
        return self.byte_frames.pop(0)

    async def send_text(self, data):
        self.sent_texts.append(json.loads(data))

    async def send_bytes(self, data):
        self.sent_bytes.append(data)

    async def close(self, code=1000, reason=None):
        self.closed = True
        self.close_code = code
        self.close_reason = reason


class WebSocketHandlerTests(unittest.TestCase):
    def setUp(self):
        stub_agent.calls.clear()
        stub_agent.checkpointer = types.SimpleNamespace(get_tuple=lambda _config: None)
        stub_stt.calls.clear()
        stub_tts.calls.clear()

    def test_rejects_connection_without_token(self):
        """WebSocket without JWT token should be rejected with code 4001."""
        websocket = FakeWebSocket()

        asyncio.run(websocket_handler(websocket, "interview-1"))

        self.assertFalse(websocket.accepted)
        self.assertTrue(websocket.closed)
        self.assertEqual(websocket.close_code, 4001)

    def test_rejects_connection_with_invalid_token(self):
        """WebSocket with invalid JWT should be rejected with code 4003."""
        websocket = FakeWebSocket(query_params={"token": "invalid-jwt-token"})

        asyncio.run(websocket_handler(websocket, "interview-1"))

        self.assertFalse(websocket.accepted)
        self.assertTrue(websocket.closed)
        self.assertEqual(websocket.close_code, 4003)

    def test_text_message_round_trip_with_auth(self):
        """Valid auth + text message should produce an AI response."""
        mock_user = types.SimpleNamespace(id="user-1", email="test@test.com", role="candidate")
        websocket = FakeWebSocket(
            text_frames=[json.dumps({"type": "text", "message": "Hello"})],
            query_params={"token": "valid"},
        )

        # Patch auth, agent refs, AND _ensure_interview_context to avoid DB calls
        import app.websocket as ws_mod

        async def fake_ensure(interview_id):
            return {"jd_text": "JD", "resume_text": "Resume"}

        async def fake_mark(*args, **kwargs):
            pass

        with patch.object(ws_mod, "authenticate_websocket_token", return_value=mock_user), \
             patch.object(ws_mod, "agent", stub_agent), \
             patch.object(ws_mod, "stt", stub_stt), \
             patch.object(ws_mod, "tts", stub_tts), \
             patch.object(ws_mod, "_ensure_interview_context", side_effect=fake_ensure), \
             patch.object(ws_mod, "_mark_interview_completed", side_effect=fake_mark):
            asyncio.run(websocket_handler(websocket, "interview-1"))

        self.assertTrue(websocket.accepted)
        # Find the response message (skip any transcription messages)
        responses = [m for m in websocket.sent_texts if m.get("type") == "response"]
        self.assertTrue(len(responses) >= 1)
        self.assertEqual(responses[0]["text"], "Agent reply")

    def test_invalid_json_returns_error(self):
        """Non-JSON text frames should return an error message."""
        mock_user = types.SimpleNamespace(id="user-1", email="test@test.com", role="candidate")

        websocket = FakeWebSocket(
            text_frames=["not-json"],
            query_params={"token": "valid"},
        )

        import app.websocket as ws_mod
        with patch.object(ws_mod, "authenticate_websocket_token", return_value=mock_user):
            asyncio.run(websocket_handler(websocket, "interview-1"))

        self.assertTrue(websocket.accepted)
        self.assertEqual(websocket.sent_texts[0], {"error": "Invalid JSON"})

    def test_completed_interview_rejects_new_messages(self):
        """If interview is already complete, new messages should be rejected."""
        mock_user = types.SimpleNamespace(id="user-1", email="test@test.com", role="candidate")

        websocket = FakeWebSocket(
            text_frames=[json.dumps({"type": "text", "message": "Hello"})],
            query_params={"token": "valid"},
        )

        import app.websocket as ws_mod

        async def fake_ensure_completed(interview_id):
            return {
                "interview_complete": True,
                "report_download_url": "/api/v1/interviews/interview-1/report.pdf",
            }

        with patch.object(ws_mod, "authenticate_websocket_token", return_value=mock_user), \
             patch.object(ws_mod, "_ensure_interview_context", side_effect=fake_ensure_completed):
            asyncio.run(websocket_handler(websocket, "interview-1"))

        self.assertTrue(websocket.accepted)
        self.assertEqual(websocket.sent_texts[0]["type"], "interview_complete")
        self.assertTrue(websocket.sent_texts[0]["interview_complete"])


if __name__ == "__main__":
    unittest.main()
