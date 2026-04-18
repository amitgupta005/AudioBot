"""
Shared pytest fixtures for the AudioBot backend test suite.

Usage:
    Fixtures defined here are automatically available to all tests
    without explicit import. Just use the fixture name as a parameter.

    Example:
        def test_health(test_client):
            response = test_client.get("/api/v1/admin/health")
            assert response.status_code == 200
"""

import os
import sys
import types
from unittest.mock import MagicMock, AsyncMock

import pytest

# Ensure the backend root is on sys.path
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)


# =====================================================
# Dummy / Mock Objects
# =====================================================

class DummyCheckpointTuple:
    """Mimics langgraph checkpoint tuples for testing."""

    def __init__(self, thread_id: str | None = None, checkpoint: dict | None = None):
        self.config = {"configurable": {"thread_id": thread_id}} if thread_id else {}
        self.checkpoint = checkpoint


class DummyCheckpointer:
    """In-memory checkpointer stub for tests."""

    def __init__(self):
        self.tuple_to_return: DummyCheckpointTuple | None = None

    def list(self, _config):
        return []

    def get_tuple(self, _config):
        return self.tuple_to_return


class DummyAgent:
    """Stub agent that records calls without needing LLM or Redis."""

    def __init__(self):
        self.update_calls: list[tuple] = []
        self.invoke_calls: list[tuple] = []
        self.checkpointer = DummyCheckpointer()

    def update_state(self, config, new_values):
        self.update_calls.append((config, new_values))

    def invoke(self, state, config=None):
        self.invoke_calls.append((state, config))
        return {"output": "stubbed response"}


class DummySTT:
    """Stub speech-to-text that returns fixed text."""

    def transcribe(self, audio_bytes: bytes, language: str = "en") -> str:
        return "stubbed transcription"


class DummyTTS:
    """Stub text-to-speech that returns empty bytes."""

    async def synthesize(self, text: str) -> bytes:
        return b""


# =====================================================
# Fixtures
# =====================================================

@pytest.fixture()
def dummy_agent() -> DummyAgent:
    """Provides a fresh DummyAgent instance."""
    return DummyAgent()


@pytest.fixture()
def dummy_stt() -> DummySTT:
    """Provides a fresh DummySTT instance."""
    return DummySTT()


@pytest.fixture()
def dummy_tts() -> DummyTTS:
    """Provides a fresh DummyTTS instance."""
    return DummyTTS()


@pytest.fixture()
def patch_dependencies(dummy_agent, dummy_stt, dummy_tts, monkeypatch):
    """
    Patches the app.dependencies module so it uses dummy agent/stt/tts
    instead of initializing the real ones (which need Redis, Groq API, etc.).

    Usage:
        def test_something(patch_dependencies, test_client):
            ...
    """
    import app.dependencies as deps_mod
    monkeypatch.setattr(deps_mod, "agent", dummy_agent)
    monkeypatch.setattr(deps_mod, "stt", dummy_stt)
    monkeypatch.setattr(deps_mod, "tts", dummy_tts)
    return dummy_agent, dummy_stt, dummy_tts


@pytest.fixture()
def test_client(patch_dependencies):
    """
    Provides a FastAPI TestClient with all dependencies mocked.
    The client is already started (lifespan entered).
    """
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        yield client
