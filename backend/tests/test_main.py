import io
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


class DummyCheckpointTuple:
    def __init__(self, thread_id=None, checkpoint=None):
        self.config = {"configurable": {"thread_id": thread_id}} if thread_id else {}
        self.checkpoint = checkpoint


class DummyCheckpointer:
    def __init__(self):
        self.tuple_to_return = None

    def list(self, _config):
        return []

    def get_tuple(self, _config):
        return self.tuple_to_return


class DummyAgent:
    def __init__(self):
        self.update_calls = []
        self.invoke_calls = []
        self.checkpointer = DummyCheckpointer()

    def update_state(self, config, new_values):
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

from app.main import app, extract_pdf_text  # noqa: E402


class FakePdfPage:
    def __init__(self, text):
        self._text = text

    def extract_text(self):
        return self._text


class FakePdf:
    def __init__(self, texts):
        self.pages = [FakePdfPage(text) for text in texts]

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class MainModuleTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_extract_pdf_text_joins_non_empty_pages(self):
        with patch("app.main.pdfplumber.open", return_value=FakePdf(["Page 1", "", "Page 3"])):
            output = extract_pdf_text(b"fake-pdf")

        self.assertEqual(output, "Page 1\nPage 3")

    def test_extract_pdf_text_raises_when_no_text_found(self):
        with patch("app.main.pdfplumber.open", return_value=FakePdf([None, ""])):
            with self.assertRaises(ValueError):
                extract_pdf_text(b"fake-pdf")

    def test_upload_resume_rejects_non_pdf_files(self):
        response = self.client.post(
            "/api/upload-resume",
            files={"resume": ("resume.txt", io.BytesIO(b"plain text"), "text/plain")},
            data={"session_id": "session-1"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "Only PDF uploads are accepted.")

    def test_upload_resume_stores_extracted_text(self):
        with patch("app.main.extract_pdf_text", return_value="Resume body text"):
            response = self.client.post(
                "/api/upload-resume",
                files={"resume": ("resume.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
                data={"session_id": "session-2"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["resume_chars"], len("Resume body text"))
        self.assertEqual(
            dummy_dependencies.agent.update_calls[-1],
            ({"configurable": {"thread_id": "session-2"}}, {"resume_text": "Resume body text"}),
        )

    def test_health_returns_ok(self):
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_get_conversation_includes_interview_report_fields(self):
        dummy_dependencies.agent.checkpointer.tuple_to_return = DummyCheckpointTuple(
            thread_id="session-3",
            checkpoint={
                "channel_values": {
                    "conversation": [],
                    "question_count": 9,
                    "interview_complete": True,
                    "completion_reason": "satisfied",
                    "report_status": "ready",
                    "candidate_summary": "Strong communicator",
                    "candidate_scores": {"communication": 9, "clarity": 8},
                    "candidate_report": {"overall_score": 8},
                    "hiring_recommendation": "yes",
                    "report_download_url": "/admin/conversations/session-3/report.pdf",
                }
            },
        )

        response = self.client.get("/admin/conversations/session-3")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["interview_complete"])
        self.assertEqual(body["question_count"], 9)
        self.assertEqual(body["report_status"], "ready")
        self.assertEqual(body["candidate_summary"], "Strong communicator")
        self.assertEqual(body["report_download_url"], "/admin/conversations/session-3/report.pdf")


if __name__ == "__main__":
    unittest.main()
