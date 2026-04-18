"""
Integration test: Full WebSocket interview flow.

This test exercises the complete lifecycle:
1. Client connects with a valid JWT
2. Sends a text message
3. Receives AI response
4. Sends another message
5. Agent signals interview_complete
6. Subsequent messages are rejected
"""

import asyncio
import json
import os
import sys
import types
import unittest
from unittest.mock import patch

import dotenv

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False


class IntegrationStubAgent:
    """Agent that tracks turn count and completes after a set number of turns."""

    def __init__(self, complete_after=2):
        self.calls = []
        self.turn = 0
        self.complete_after = complete_after
        self.checkpointer = types.SimpleNamespace(get_tuple=lambda _config: None)

    def invoke(self, state, config=None):
        self.calls.append((state, config))
        self.turn += 1
        is_complete = self.turn >= self.complete_after
        return {
            "output": f"AI response turn {self.turn}",
            "interview_complete": is_complete,
            "report_download_url": "/api/v1/interviews/test-id/report.pdf" if is_complete else None,
        }

    def update_state(self, config, values):
        pass


from fastapi import WebSocketDisconnect  # noqa: E402


class FakeWebSocket:
    """Multi-turn WebSocket simulator."""

    def __init__(self, text_frames=None, byte_frames=None, query_params=None):
        self.text_frames = list(text_frames or [])
        self.byte_frames = list(byte_frames or [])
        self.sent_texts = []
        self.sent_bytes = []
        self.accepted = False
        self.closed = False
        self.close_code = None
        self.query_params = query_params or {}

    async def accept(self):
        self.accepted = True

    async def receive_text(self):
        if not self.text_frames:
            raise WebSocketDisconnect()
        return self.text_frames.pop(0)

    async def receive_bytes(self):
        if not self.byte_frames:
            raise RuntimeError("No binary frame")
        return self.byte_frames.pop(0)

    async def send_text(self, data):
        self.sent_texts.append(json.loads(data))

    async def send_bytes(self, data):
        self.sent_bytes.append(data)

    async def close(self, code=1000, reason=None):
        self.closed = True
        self.close_code = code


class FullInterviewFlowTest(unittest.TestCase):
    """Integration test for a complete multi-turn interview → completion → rejection flow."""

    def test_full_flow(self):
        stub_agent = IntegrationStubAgent(complete_after=2)

        mock_user = types.SimpleNamespace(id="user-1", email="test@test.com", role="candidate")

        # Simulate 3 turns:
        # Turn 1: text → agent replies (not complete)
        # Turn 2: text → agent replies (complete)
        # Turn 3: text → should be rejected (interview already complete)
        websocket = FakeWebSocket(
            text_frames=[
                json.dumps({"type": "text", "message": "Hello, I'm ready"}),
                json.dumps({"type": "text", "message": "My final answer"}),
                json.dumps({"type": "text", "message": "One more thing"}),
            ],
            query_params={"token": "valid"},
        )

        # Track calls to _ensure_interview_context to simulate state changes
        call_count = [0]

        async def fake_ensure(interview_id):
            call_count[0] += 1
            if call_count[0] >= 3:
                # After turn 2 completed, simulate interview_complete in checkpoint
                return {
                    "interview_complete": True,
                    "report_download_url": "/api/v1/interviews/test-id/report.pdf",
                }
            return {}

        import app.websocket as ws_mod

        with patch.object(ws_mod, "authenticate_websocket_token", return_value=mock_user), \
             patch.object(ws_mod, "_ensure_interview_context", side_effect=fake_ensure), \
             patch.object(ws_mod, "agent", stub_agent), \
             patch.object(ws_mod, "stt", types.SimpleNamespace(transcribe=lambda b: "text")), \
             patch.object(ws_mod, "tts", types.SimpleNamespace(synthesize=lambda t: b"")):
            asyncio.run(ws_mod.websocket_handler(websocket, "test-interview"))

        # Verify
        self.assertTrue(websocket.accepted)

        # Turn 1: should get an AI response
        responses = [m for m in websocket.sent_texts if m.get("type") == "response"]
        self.assertTrue(len(responses) >= 1, f"Expected response messages, got: {websocket.sent_texts}")
        self.assertEqual(responses[0]["text"], "AI response turn 1")
        self.assertFalse(responses[0]["interview_complete"])

        # Turn 2: should get a completion response
        self.assertEqual(responses[1]["text"], "AI response turn 2")
        self.assertTrue(responses[1]["interview_complete"])

        # Turn 3: should be rejected
        rejection = [m for m in websocket.sent_texts if m.get("type") == "interview_complete"]
        self.assertTrue(len(rejection) >= 1, f"Expected rejection, got: {websocket.sent_texts}")
        self.assertTrue(rejection[0]["interview_complete"])

        # Agent should only have been called twice (not for the rejected message)
        self.assertEqual(len(stub_agent.calls), 2)


if __name__ == "__main__":
    unittest.main()
