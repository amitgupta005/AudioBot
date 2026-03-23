import os
import sys
import types
import unittest

import dotenv


BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.append(BACKEND_ROOT)

dotenv.load_dotenv = lambda *args, **kwargs: False


class BaseMessage:
    def __init__(self, content):
        self.content = content


class HumanMessage(BaseMessage):
    type = "human"


class AIMessage(BaseMessage):
    type = "ai"


class SystemMessage(BaseMessage):
    type = "system"


message_module = types.ModuleType("langchain_core.messages")
message_module.BaseMessage = BaseMessage
message_module.HumanMessage = HumanMessage
message_module.AIMessage = AIMessage
message_module.SystemMessage = SystemMessage
sys.modules["langchain_core.messages"] = message_module


class FakeStructuredResponse:
    def __init__(self, intent):
        self.intent = intent


class FakeStructuredLlm:
    def __init__(self, intent):
        self.intent = intent
        self.calls = []

    def invoke(self, messages):
        self.calls.append(messages)
        return FakeStructuredResponse(self.intent)


class FakeLlm:
    def __init__(self):
        self.structured_intent = "chat"
        self.structured = FakeStructuredLlm(self.structured_intent)
        self.calls = []

    def with_structured_output(self, _schema):
        self.structured = FakeStructuredLlm(self.structured_intent)
        return self.structured

    def invoke(self, messages):
        self.calls.append(messages)
        return AIMessage("Model response")


fake_langchain_groq = types.ModuleType("langchain_groq")
fake_langchain_groq.ChatGroq = lambda **kwargs: FakeLlm()
sys.modules["langchain_groq"] = fake_langchain_groq

from app.agent import nodes  # noqa: E402


class AgentNodeTests(unittest.TestCase):
    def setUp(self):
        nodes.llm.structured_intent = "chat"
        nodes.llm.calls.clear()

    def test_intent_classifier_returns_structured_intent(self):
        nodes.llm.structured_intent = "clarify"

        result = nodes.intent_classifier_node({"user_input": "???", "conversation": []})

        self.assertEqual(result, {"intent": "clarify"})
        self.assertEqual(nodes.llm.structured.calls[0][1].content, "???")

    def test_clarify_node_appends_human_and_ai_messages(self):
        state = {"user_input": "unclear", "conversation": [HumanMessage("Earlier")]}

        result = nodes.clarify_node(state)

        self.assertEqual(result["output"], "I'm not fully sure what you want yet. Could you please clarify or give a bit more detail?")
        self.assertEqual(len(result["conversation"]), 3)
        self.assertEqual(result["conversation"][-2].content, "unclear")
        self.assertEqual(result["conversation"][-1].type, "ai")

    def test_chat_node_formats_system_message_on_first_turn(self):
        state = {
            "user_input": "Hello",
            "conversation": [],
            "system_message": "JD={jd_text} RESUME={resume_text}",
            "jd_text": "JD body",
            "resume_text": "Resume body",
        }

        result = nodes.chat_node(state)

        self.assertEqual(result["output"], "Model response")
        sent_messages = nodes.llm.calls[0]
        self.assertEqual(sent_messages[0].content, "JD=JD body RESUME=Resume body")
        self.assertEqual(sent_messages[1].content, "Hello")

    def test_chat_node_uses_existing_history_without_new_system_message(self):
        state = {
            "user_input": "Next answer",
            "conversation": [HumanMessage("Earlier"), AIMessage("Previous reply")],
            "system_message": "unused",
        }

        nodes.chat_node(state)

        sent_messages = nodes.llm.calls[0]
        self.assertEqual(len(sent_messages), 3)
        self.assertEqual(sent_messages[0].content, "Earlier")
        self.assertEqual(sent_messages[-1].content, "Next answer")

    def test_chat_node_skips_dummy_initialization_message(self):
        state = {
            "user_input": "SYSTEM_INITIALIZATION",
            "conversation": [],
            "system_message": "Prompt",
        }

        result = nodes.chat_node(state)

        self.assertEqual(result["output"], "Initialized")
        self.assertEqual(nodes.llm.calls, [])

    def test_chat_node_keeps_unformatted_template_when_context_missing(self):
        state = {
            "user_input": "Hi",
            "conversation": [],
            "system_message": "JD={jd_text} RESUME={resume_text}",
            "jd_text": "only jd",
            "resume_text": None,
        }

        nodes.chat_node(state)

        self.assertEqual(nodes.llm.calls[0][0].content, "JD={jd_text} RESUME={resume_text}")


if __name__ == "__main__":
    unittest.main()
