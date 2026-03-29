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
                should_end_interview=False,
                should_ask_followup=True,
                completion_reason="in_progress",
            ),
            "CandidateReport": types.SimpleNamespace(
                overall_score=8,
                scores=types.SimpleNamespace(
                    model_dump=lambda: {
                        "communication": 8,
                        "clarity": 7,
                        "role_fit": 8,
                        "problem_solving": 7,
                        "confidence": 8,
                        "professionalism": 9,
                    }
                ),
                strengths=["Clear communication"],
                concerns=["Needs deeper examples"],
                summary="Good fit overall.",
                recommendation="yes",
                model_dump=lambda: {
                    "overall_score": 8,
                    "scores": {
                        "communication": 8,
                        "clarity": 7,
                        "role_fit": 8,
                        "problem_solving": 7,
                        "confidence": 8,
                        "professionalism": 9,
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


class AgentNodeTests(unittest.TestCase):
    def setUp(self):
        nodes.llm.calls.clear()
        nodes.build_candidate_report_pdf = lambda session_id, report, summary, recommendation: f"/tmp/{session_id}.pdf"
        nodes.llm.structured_responses["IntentResponse"] = types.SimpleNamespace(intent="chat")
        nodes.llm.structured_responses["InterviewDecision"] = types.SimpleNamespace(
            is_satisfied=False,
            should_end_interview=False,
            should_ask_followup=True,
            completion_reason="in_progress",
        )

    def test_intent_classifier_returns_structured_intent(self):
        nodes.llm.structured_responses["IntentResponse"] = types.SimpleNamespace(intent="clarify")

        result = nodes.intent_classifier_node({"user_input": "???", "conversation": []})

        self.assertEqual(result, {"intent": "clarify"})
        self.assertEqual(nodes.llm.structured.calls[0][1].content, "???")

    def test_clarify_node_appends_human_and_ai_messages(self):
        state = {"user_input": "unclear", "conversation": [HumanMessage("Earlier")]}

        result = nodes.clarify_node(state)

        self.assertEqual(result["completion_reason"], "in_progress")
        self.assertEqual(len(result["conversation"]), 3)
        self.assertEqual(result["conversation"][-2].content, "unclear")
        self.assertEqual(result["conversation"][-1].type, "ai")

    def test_interview_evaluator_forces_followup_before_eight_questions(self):
        result = nodes.interview_evaluator_node({
            "user_input": "My answer",
            "conversation": [],
            "question_count": 4,
        })

        self.assertTrue(result["should_ask_followup"])
        self.assertFalse(result["interview_complete"])

    def test_interview_evaluator_can_end_interview_after_eight_questions(self):
        nodes.llm.structured_responses["InterviewDecision"] = types.SimpleNamespace(
            is_satisfied=True,
            should_end_interview=True,
            should_ask_followup=False,
            completion_reason="satisfied",
        )

        result = nodes.interview_evaluator_node({
            "user_input": "Final answer",
            "conversation": [HumanMessage("Q1"), AIMessage("A1")],
            "question_count": 8,
            "system_message": "Prompt",
        })

        self.assertTrue(result["interview_complete"])
        self.assertEqual(result["completion_reason"], "satisfied")

    def test_interview_decision_schema_normalizes_string_booleans(self):
        decision = InterviewDecision.model_validate({
            "is_satisfied": "true",
            "should_end_interview": "false",
            "should_ask_followup": "True",
            "completion_reason": "in_progress",
        })

        self.assertIs(decision.is_satisfied, True)
        self.assertIs(decision.should_end_interview, False)
        self.assertIs(decision.should_ask_followup, True)

    def test_ask_question_node_formats_system_message_on_first_turn(self):
        state = {
            "user_input": "Hello",
            "conversation": [],
            "system_message": "JD={jd_text} RESUME={resume_text}",
            "jd_text": "JD body",
            "resume_text": "Resume body",
            "question_count": 0,
        }

        result = nodes.ask_question_node(state)

        self.assertEqual(result["output"], "Model response")
        self.assertEqual(result["question_count"], 1)
        sent_messages = nodes.llm.calls[0]
        self.assertEqual(sent_messages[0].content, "JD=JD body RESUME=Resume body")
        self.assertEqual(sent_messages[1].content, "Hello")

    def test_close_interview_node_marks_session_complete(self):
        state = {
            "user_input": "My last answer",
            "conversation": [HumanMessage("Question"), AIMessage("Previous prompt")],
            "question_count": 9,
            "completion_reason": "satisfied",
        }

        result = nodes.close_interview_node(state)

        self.assertTrue(result["interview_complete"])
        self.assertEqual(result["report_status"], "pending")
        self.assertEqual(result["conversation"][-1].content, "Model response")

    def test_report_generator_node_builds_scores_and_summary(self):
        state = {
            "interview_complete": True,
            "conversation": [HumanMessage("Answer"), AIMessage("Closing")],
            "jd_text": "JD text",
            "resume_text": "Resume text",
        }

        result = nodes.report_generator_node(state)

        self.assertEqual(result["report_status"], "ready")
        self.assertEqual(result["candidate_summary"], "Good fit overall.")
        self.assertEqual(result["candidate_scores"]["communication"], 8)
        self.assertTrue(result["report_pdf_path"].endswith(".pdf"))
        self.assertIn("/admin/conversations/", result["report_download_url"])


if __name__ == "__main__":
    unittest.main()
