"""
Tests for agent nodes (app/agent/nodes.py).

Updated for current API:
- InterviewDecision.is_satisfied is bool (not Literal['True','False'])
- InterviewDecision only has is_satisfied + satisfaction_reason
- report_generator_node takes (state, config)
- clarify_node returns {"output": str} only
- ask_question_node uses structured output (ResponseInterview)
"""

import os
import sys
import types
import unittest

import dotenv

BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

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


class FakeStructuredLlm:
    def __init__(self, parent, schema_name):
        self.parent = parent
        self.schema_name = schema_name
        self.calls = []

    def invoke(self, messages):
        self.calls.append(messages)
        return self.parent.structured_responses[self.schema_name]


class FakeLlm:
    def __init__(self):
        self.calls = []
        self.structured = None
        self.structured_responses = {
            "IntentResponse": types.SimpleNamespace(intent="chat"),
            "InterviewDecision": types.SimpleNamespace(
                is_satisfied=False,
                satisfaction_reason="in_progress",
            ),
            "ResponseInterview": types.SimpleNamespace(
                acknowledgement="Noted.",
                question="Tell me more?",
            ),
            "CandidateReport": types.SimpleNamespace(
                overall_score=8,
                scores=types.SimpleNamespace(
                    model_dump=lambda: {
                        "communication": 8, "clarity": 7,
                        "role_fit": 8, "problem_solving": 7,
                        "confidence": 8, "professionalism": 9,
                    }
                ),
                strengths=["Clear communication"],
                concerns=["Needs deeper examples"],
                summary="Good fit overall.",
                recommendation="yes",
                model_dump=lambda: {
                    "overall_score": 8,
                    "scores": {
                        "communication": 8, "clarity": 7,
                        "role_fit": 8, "problem_solving": 7,
                        "confidence": 8, "professionalism": 9,
                    },
                    "strengths": ["Clear communication"],
                    "concerns": ["Needs deeper examples"],
                    "summary": "Good fit overall.",
                    "recommendation": "yes",
                },
            ),
        }

    def with_structured_output(self, schema):
        self.structured = FakeStructuredLlm(self, schema.__name__)
        return self.structured

    def invoke(self, messages):
        self.calls.append(messages)
        return AIMessage("Model response")


fake_langchain_groq = types.ModuleType("langchain_groq")
fake_langchain_groq.ChatGroq = lambda **kwargs: FakeLlm()
sys.modules["langchain_groq"] = fake_langchain_groq

from app.agent import nodes  # noqa: E402
from app.agent.schema import InterviewDecision  # noqa: E402


class TestIntentClassifierNode(unittest.TestCase):
    def setUp(self):
        nodes.llm.calls.clear()
        nodes.llm.structured_responses["IntentResponse"] = types.SimpleNamespace(intent="chat")

    def test_returns_structured_intent(self):
        nodes.llm.structured_responses["IntentResponse"] = types.SimpleNamespace(intent="clarify")

        result = nodes.intent_classifier_node({
            "user_input": "???",
            "conversation": [SystemMessage("system prompt")],
            "question_count": 1,
        })

        self.assertEqual(result, {"intent": "clarify"})

    def test_empty_input_returns_end(self):
        result = nodes.intent_classifier_node({"user_input": "", "question_count": 1})
        self.assertEqual(result["intent"], "END")

    def test_first_turn_with_context_returns_chat(self):
        result = nodes.intent_classifier_node({
            "user_input": "Hello",
            "question_count": 0,
            "jd_text": "JD body",
            "resume_text": "Resume body",
        })
        self.assertEqual(result["intent"], "chat")
        self.assertIn("JD body", result["system_message"])
        self.assertIn("Resume body", result["system_message"])

    def test_first_turn_without_context_returns_end(self):
        result = nodes.intent_classifier_node({
            "user_input": "Hello",
            "question_count": 0,
            "jd_text": None,
            "resume_text": None,
        })
        self.assertEqual(result["intent"], "END")


class TestClarifyNode(unittest.TestCase):
    def test_returns_clarification_output(self):
        result = nodes.clarify_node({"user_input": "unclear"})
        self.assertIn("clarify", result["output"].lower())


class TestInterviewEvaluatorNode(unittest.TestCase):
    def setUp(self):
        nodes.llm.structured_responses["InterviewDecision"] = types.SimpleNamespace(
            is_satisfied=False,
            satisfaction_reason="in_progress",
        )

    def test_not_satisfied_continues_interview(self):
        result = nodes.interview_evaluator_node({
            "user_input": "My answer",
            "conversation": [SystemMessage("prompt")],
            "question_count": 4,
        })
        self.assertFalse(result["interview_complete"])
        self.assertFalse(result["is_satisfied"])

    def test_satisfied_ends_interview(self):
        nodes.llm.structured_responses["InterviewDecision"] = types.SimpleNamespace(
            is_satisfied=True,
            satisfaction_reason="good answers",
        )

        result = nodes.interview_evaluator_node({
            "user_input": "Final answer",
            "conversation": [SystemMessage("prompt"), HumanMessage("Q"), AIMessage("A")],
            "question_count": 8,
        })
        self.assertTrue(result["interview_complete"])
        self.assertTrue(result["is_satisfied"])
        self.assertEqual(result["satisfaction_reason"], "good answers")

    def test_force_ends_at_10_questions(self):
        result = nodes.interview_evaluator_node({
            "user_input": "answer",
            "conversation": [],
            "question_count": 10,
        })
        self.assertTrue(result["interview_complete"])


class TestInterviewDecisionSchema(unittest.TestCase):
    def test_bool_field_accepts_true(self):
        decision = InterviewDecision.model_validate({
            "is_satisfied": True,
            "satisfaction_reason": "test",
        })
        self.assertIs(decision.is_satisfied, True)

    def test_bool_field_accepts_false(self):
        decision = InterviewDecision.model_validate({
            "is_satisfied": False,
            "satisfaction_reason": "test",
        })
        self.assertIs(decision.is_satisfied, False)

    def test_bool_field_coerces_string(self):
        decision = InterviewDecision.model_validate({
            "is_satisfied": "true",
            "satisfaction_reason": "test",
        })
        self.assertIs(decision.is_satisfied, True)


class TestAskQuestionNode(unittest.TestCase):
    def test_appends_messages_and_increments_count(self):
        state = {
            "user_input": "Hello",
            "conversation": [SystemMessage("system")],
            "question_count": 0,
        }

        result = nodes.ask_question_node(state)

        self.assertIn("Noted.", result["output"])
        self.assertIn("Tell me more?", result["output"])
        self.assertEqual(result["question_count"], 1)
        self.assertTrue(len(result["conversation"]) >= 3)  # System + Human + AI


class TestCloseInterviewNode(unittest.TestCase):
    def test_marks_session_complete(self):
        state = {
            "user_input": "My last answer",
            "conversation": [SystemMessage("prompt"), HumanMessage("Q"), AIMessage("A")],
            "question_count": 9,
        }

        result = nodes.close_interview_node(state)

        self.assertIn("output", result)
        self.assertIn("conversation", result)
        self.assertTrue(result["conversation"][-1].type == "ai")


class TestReportGeneratorNode(unittest.TestCase):
    def setUp(self):
        # Mock the PDF builder
        nodes.build_candidate_report_pdf = (
            lambda session_id, report, summary, recommendation, transcript_lines: f"/tmp/{session_id}.pdf"
        )

    def test_generates_report_with_config(self):
        state = {
            "conversation": [SystemMessage("prompt"), HumanMessage("Answer"), AIMessage("Closing")],
            "jd_text": "JD text",
            "resume_text": "Resume text",
        }
        config = {"configurable": {"thread_id": "interview-123"}}

        result = nodes.report_generator_node(state, config)

        self.assertIn("candidate_report", result)
        self.assertIn("candidate_report_pdf", result)
        self.assertIn("report_download_url", result)
        self.assertEqual(result["candidate_report"]["overall_score"], 8)
        self.assertTrue(result["candidate_report_pdf"].endswith(".pdf"))
        self.assertIn("interview-123", result["report_download_url"])


if __name__ == "__main__":
    unittest.main()
