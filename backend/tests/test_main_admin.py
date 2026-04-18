"""
Tests for admin routes (app/routers/admin.py).

Tests cover:
- GET /api/v1/admin/conversations
- GET /api/v1/admin/conversations/{id}
- GET /api/v1/admin/conversations/{id}/report.pdf
- GET /api/v1/admin/health
- GET /api/v1/admin/health/llm

Uses FastAPI dependency overrides to bypass real database and auth.
"""

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


# ==============================================================
# Stubs for app.dependencies (must be set BEFORE importing app)
# ==============================================================

class DummyMessage:
    def __init__(self, msg_type, content):
        self.type = msg_type
        self.content = content


class DummyCheckpointTuple:
    def __init__(self, thread_id=None, checkpoint=None):
        self.config = {"configurable": {"thread_id": thread_id}} if thread_id else {}
        self.checkpoint = checkpoint


class DummyCheckpointer:
    def __init__(self):
        self.entries = []
        self.by_thread = {}

    def list(self, _config):
        return self.entries

    def get_tuple(self, config):
        thread_id = config["configurable"]["thread_id"]
        return self.by_thread.get(thread_id)


class DummyAgent:
    def __init__(self):
        self.checkpointer = DummyCheckpointer()
        self.update_calls = []
        self.invoke_calls = []

    def update_state(self, config, new_values):
        self.update_calls.append((config, new_values))

    def invoke(self, state, config=None):
        self.invoke_calls.append((state, config))
        return {"output": "stubbed"}


# Inject stubs into sys.modules BEFORE importing the app
_dummy_deps = types.ModuleType("app.dependencies")
_dummy_agent = DummyAgent()
_dummy_deps.agent = _dummy_agent
_dummy_deps.stt = types.SimpleNamespace(transcribe=lambda b: "text")
_dummy_deps.tts = types.SimpleNamespace(synthesize=lambda t: b"")
sys.modules["app.dependencies"] = _dummy_deps

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.core.security import get_current_user, require_admin  # noqa: E402


# ==============================================================
# Fake admin user for dependency override
# ==============================================================

class FakeAdminUser:
    """Mimics the User model with admin role."""
    id = "admin-user-id"
    email = "admin@test.com"
    role = "admin"
    full_name = "Admin User"
    company_name = "Test Corp"
    password_hash = "fake"
    is_admin = True
    is_recruiter = True
    is_candidate = False


async def _fake_get_current_user():
    return FakeAdminUser()


async def _fake_require_admin():
    return FakeAdminUser()


# ==============================================================
# Tests
# ==============================================================

class AdminRouteTests(unittest.TestCase):
    def setUp(self):
        # Override auth dependencies to skip database
        app.dependency_overrides[get_current_user] = _fake_get_current_user
        app.dependency_overrides[require_admin] = _fake_require_admin
        # Ensure the lazy 'from app.dependencies import agent' always gets our dummy
        self._agent_patch = patch("app.dependencies.agent", _dummy_agent)
        self._agent_patch.start()
        self.client = TestClient(app, raise_server_exceptions=False)
        # Reset agent state
        _dummy_agent.checkpointer.entries = []
        _dummy_agent.checkpointer.by_thread = {}
        _dummy_agent.update_calls.clear()
        _dummy_agent.invoke_calls.clear()

    def tearDown(self):
        app.dependency_overrides.clear()
        self._agent_patch.stop()

    def test_health_returns_ok(self):
        response = self.client.get("/api/v1/admin/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_list_conversations_returns_unique_sorted_ids(self):
        _dummy_agent.checkpointer.entries = [
            DummyCheckpointTuple(thread_id="b-thread"),
            DummyCheckpointTuple(thread_id="a-thread"),
            DummyCheckpointTuple(thread_id="b-thread"),
        ]

        response = self.client.get("/api/v1/admin/conversations")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"conversations": ["a-thread", "b-thread"]})

    def test_get_conversation_returns_serialized_messages(self):
        _dummy_agent.checkpointer.by_thread["thread-1"] = DummyCheckpointTuple(
            checkpoint={
                "channel_values": {
                    "conversation": [
                        DummyMessage("human", "Hi"),
                        DummyMessage("ai", "Hello"),
                    ],
                    "jd_text": "JD",
                    "resume_text": "Resume",
                }
            }
        )

        response = self.client.get("/api/v1/admin/conversations/thread-1")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["interview_id"], "thread-1")
        self.assertEqual(payload["messages"][0]["data"]["content"], "Hi")
        self.assertEqual(payload["context"], {"jd_text": "JD", "resume_text": "Resume"})

    def test_get_conversation_returns_404_when_missing(self):
        response = self.client.get("/api/v1/admin/conversations/unknown")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Conversation not found")

    def test_health_llm_success(self):
        fake_module = types.ModuleType("langchain_groq")

        class FakeChatGroq:
            def __init__(self, model):
                self.model = model

            def invoke(self, _prompt):
                return "ok"

        fake_module.ChatGroq = FakeChatGroq

        with patch.dict(sys.modules, {"langchain_groq": fake_module}):
            response = self.client.get("/api/v1/admin/health/llm")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"llm": "reachable"})

    def test_health_llm_failure(self):
        fake_module = types.ModuleType("langchain_groq")

        class FakeChatGroq:
            def __init__(self, model):
                self.model = model

            def invoke(self, _prompt):
                raise RuntimeError("unreachable")

        fake_module.ChatGroq = FakeChatGroq

        with patch.dict(sys.modules, {"langchain_groq": fake_module}):
            response = self.client.get("/api/v1/admin/health/llm")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"], "LLM not reachable")

    def test_report_download_returns_404_when_no_report(self):
        _dummy_agent.checkpointer.by_thread["no-report"] = DummyCheckpointTuple(
            checkpoint={"channel_values": {}}
        )
        response = self.client.get("/api/v1/admin/conversations/no-report/report.pdf")
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
