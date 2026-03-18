import asyncio
import json
import os
import sys
import types
import unittest

import dotenv

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.append(BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False


class StubAgent:
    def __init__(self):
        self.calls = []

    def invoke(self, state, config=None):
        self.calls.append((state, config))
        return {"output": "Agent reply"}


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


stub_dependencies = types.ModuleType("app.dependencies")
stub_dependencies.agent = StubAgent()
stub_dependencies.stt = StubStt()
stub_dependencies.tts = StubTts()
sys.modules["app.dependencies"] = stub_dependencies

from app.websocket import websocket_handler  # noqa: E402


class FakeWebSocketDisconnect(Exception):
    pass


class FakeWebSocket:
    def __init__(self, text_frames=None, byte_frames=None):
        self.text_frames = list(text_frames or [])
        self.byte_frames = list(byte_frames or [])
        self.sent_texts = []
        self.sent_bytes = []
        self.accepted = False

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        if not self.text_frames:
            raise FakeWebSocketDisconnect()
        return self.text_frames.pop(0)

    async def receive_bytes(self):
        if not self.byte_frames:
            raise RuntimeError("No binary frame available")
        return self.byte_frames.pop(0)

    async def send_text(self, data):
        self.sent_texts.append(json.loads(data))

    async def send_bytes(self, data):
        self.sent_bytes.append(data)


class WebSocketHandlerTests(unittest.TestCase):
    def setUp(self):
        self.original_disconnect = getattr(sys.modules["app.websocket"], "WebSocketDisconnect", None)
        sys.modules["app.websocket"].WebSocketDisconnect = FakeWebSocketDisconnect
        stub_dependencies.agent.calls.clear()
        stub_dependencies.stt.calls.clear()
        stub_dependencies.tts.calls.clear()

    def tearDown(self):
        sys.modules["app.websocket"].WebSocketDisconnect = self.original_disconnect

    def test_text_message_round_trip(self):
        websocket = FakeWebSocket(
            text_frames=[json.dumps({"type": "text", "conversation_id": "conv-1", "message": "Hello"})]
        )

        asyncio.run(websocket_handler(websocket))

        self.assertTrue(websocket.accepted)
        self.assertEqual(websocket.sent_texts[0]["type"], "response")
        self.assertEqual(websocket.sent_texts[0]["text"], "Agent reply")
        self.assertEqual(
            stub_dependencies.agent.calls[0][1],
            {"configurable": {"thread_id": "conv-1"}},
        )

    def test_audio_message_returns_transcription_and_audio(self):
        websocket = FakeWebSocket(
            text_frames=[json.dumps({"type": "audio", "conversation_id": "conv-2"})],
            byte_frames=[b"wav-bytes"],
        )

        asyncio.run(websocket_handler(websocket))

        self.assertEqual(websocket.sent_texts[0]["type"], "transcription")
        self.assertEqual(websocket.sent_texts[0]["text"], "Transcribed speech")
        self.assertEqual(websocket.sent_texts[1]["type"], "response")
        self.assertEqual(websocket.sent_bytes, [b"audio-reply"])
        self.assertEqual(stub_dependencies.stt.calls, [b"wav-bytes"])
        self.assertEqual(stub_dependencies.tts.calls, ["Agent reply"])

    def test_invalid_json_returns_error(self):
        websocket = FakeWebSocket(text_frames=["not-json"])

        asyncio.run(websocket_handler(websocket))

        self.assertEqual(websocket.sent_texts[0], {"error": "Invalid JSON"})


if __name__ == "__main__":
    unittest.main()
