import importlib
import os
import sys
import types
import unittest
from unittest.mock import patch

import dotenv


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.append(BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False


class DependencyBootstrapTests(unittest.TestCase):
    def test_dependencies_module_initializes_singletons(self):
        fake_graph = types.ModuleType("app.agent.graph")
        fake_stt = types.ModuleType("app.audio.stt")
        fake_tts = types.ModuleType("app.audio.tts")

        fake_agent = object()
        fake_stt_instance = object()
        fake_tts_instance = object()

        fake_graph.build_agent = lambda: fake_agent
        fake_stt.SpeechToText = lambda: fake_stt_instance
        fake_tts.TextToSpeech = lambda: fake_tts_instance

        with patch.dict(
            sys.modules,
            {
                "app.agent.graph": fake_graph,
                "app.audio.stt": fake_stt,
                "app.audio.tts": fake_tts,
            },
        ):
            sys.modules.pop("app.dependencies", None)
            module = importlib.import_module("app.dependencies")

        self.assertIs(module.agent, fake_agent)
        self.assertIs(module.stt, fake_stt_instance)
        self.assertIs(module.tts, fake_tts_instance)


if __name__ == "__main__":
    unittest.main()
