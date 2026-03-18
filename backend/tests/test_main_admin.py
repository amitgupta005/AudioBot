import os
import sys
import types
import unittest
from unittest.mock import patch

import dotenv
from fastapi.testclient import TestClient


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.append(BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False


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
        self.raise_on_update = False
        self.update_calls = []
        self.invoke_calls = []

    def update_state(self, config, new_values):
        if self.raise_on_update:
            raise RuntimeError("missing thread")
        self.update_calls.append((config, new_values))

    def invoke(self, state, config=None):
        self.invoke_calls.append((state, config))
        return {"output": "stubbed"}


dummy_dependencies = types.ModuleType("app.dependencies")
dummy_dependencies.agent = DummyAgent()

dummy_websocket = types.ModuleType("app.websocket")


async def _noop_handler(_websocket):
    return None


dummy_websocket.websocket_handler = _noop_handler

sys.modules["app.dependencies"] = dummy_dependencies
sys.modules["app.websocket"] = dummy_websocket

from app.main import _initialize_thread_state, app  # noqa: E402


class MainAdminTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        dummy_dependencies.agent.raise_on_update = False
        dummy_dependencies.agent.update_calls.clear()
        dummy_dependencies.agent.invoke_calls.clear()
        dummy_dependencies.agent.checkpointer.entries = []
        dummy_dependencies.agent.checkpointer.by_thread = {}

    def test_upload_jd_stores_extracted_text(self):
        with patch("app.main.extract_pdf_text", return_value="JD text"):
            response = self.client.post(
                "/api/upload-jd",
                files={"jd": ("jd.pdf", b"%PDF-1.4", "application/pdf")},
                data={"session_id": "jd-session"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["jd_chars"], len("JD text"))
        self.assertEqual(
            dummy_dependencies.agent.update_calls[-1],
            ({"configurable": {"thread_id": "jd-session"}}, {"jd_text": "JD text"}),
        )

    def test_initialize_thread_state_falls_back_to_initial_invoke(self):
        dummy_dependencies.agent.raise_on_update = True

        _initialize_thread_state("new-thread", {"resume_text": "Resume"})

        state, config = dummy_dependencies.agent.invoke_calls[-1]
        self.assertEqual(config, {"configurable": {"thread_id": "new-thread"}})
        self.assertEqual(state["user_input"], "SYSTEM_INITIALIZATION")
        self.assertEqual(state["resume_text"], "Resume")

    def test_list_conversations_returns_unique_sorted_ids(self):
        dummy_dependencies.agent.checkpointer.entries = [
            DummyCheckpointTuple(thread_id="b-thread"),
            DummyCheckpointTuple(thread_id="a-thread"),
            DummyCheckpointTuple(thread_id="b-thread"),
        ]

        response = self.client.get("/admin/conversations")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"conversations": ["a-thread", "b-thread"]})

    def test_get_conversation_returns_serialized_messages_and_context(self):
        dummy_dependencies.agent.checkpointer.by_thread["thread-1"] = DummyCheckpointTuple(
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

        response = self.client.get("/admin/conversations/thread-1")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["conversation_id"], "thread-1")
        self.assertEqual(payload["messages"][0]["data"]["content"], "Hi")
        self.assertEqual(payload["context"], {"jd_text": "JD", "resume_text": "Resume"})

    def test_get_conversation_returns_404_when_missing(self):
        response = self.client.get("/admin/conversations/unknown")

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
            response = self.client.get("/health/llm")

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
            response = self.client.get("/health/llm")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["detail"], "LLM not reachable")


if __name__ == "__main__":
    unittest.main()
