from typing import Literal
from pydantic import BaseModel, Field, field_validator


BooleanLike = bool | Literal["true", "false", "True", "False"]


class IntentResponse(BaseModel):
    intent: Literal["chat", "clarify"] = Field(
        description="The classified intent of the user input."
    )


class InterviewDecision(BaseModel):
    is_satisfied: Literal['True', 'False'] = Field(
        description="Based on the candidate's response, decide whether the interviewer is satisfied and has enough evidence to stop the interview."
    )
    satisfaction_reason: str = Field(
        description="What is the reason for the interviewer to be satisfied with the interview session"
    )


# class ResponseInterview(BaseModel):
#     # =========================
#     # 👤 USER-FACING OUTPUT
#     # =========================

#     acknowledgement: str = Field(
#         description=(
#             "A concise and natural acknowledgement of the candidate's response. "
#             "It should sound like a human interviewer reacting to the answer. "
#             "Do NOT ask any question here. "
#             "Do NOT repeat the candidate's answer verbatim. "
#             "Keep it to one sentence."
#         )
#     )

#     question: str = Field(
#         description=(
#             "Exactly one clear, concise, and relevant follow-up question for the candidate. "
#             "The question must be based on the candidate's previous response, the conversation history, "
#             "and the job description. "
#             "Do NOT ask multiple questions. "
#             "Do NOT include explanations or commentary—only the question."
#         )
#     )

#     # =========================
#     # 🧠 INTERNAL EVALUATION
#     # =========================

#     evaluation: str = Field(
#         description=(
#             "A brief internal evaluation of the candidate's answer. "
#             "Highlight strengths, weaknesses, and any gaps in understanding. "
#             "This is NOT shown to the candidate and is used for assessment and report generation."
#         ),
#         examples=[
#             "Good understanding of basics but lacks depth in distributed systems.",
#             "Strong answer with clear reasoning and practical experience.",
#         ],
#     )
#     # =========================
#     # 🧭 CONTEXT TRACKING
#     # =========================

#     topic: Optional[str] = Field(
#         description=(
#             "The main topic or skill currently being evaluated "
#             "(e.g., 'data structures', 'system design', 'backend development'). "
#             "Helps maintain structured interview coverage."
#         ),
#         examples=["system design", "database optimization"],
#     )

#     difficulty: Optional[Literal["easy", "medium", "hard"]] = Field(
#         description=(
#             "The difficulty level of the next question. "
#             "Should adapt based on the candidate's performance:\n"
#             "- easy → if candidate is struggling\n"
#             "- medium → default level\n"
#             "- hard → if candidate is performing well"
#         ),
#         examples=["medium", "hard"],
#     )

#     # =========================
#     # 🔍 INTERNAL REASONING (OPTIONAL)
#     # =========================

#     reasoning: Optional[str] = Field(
#         description=(
#             "Internal reasoning behind the evaluation"
#         )
#     )

class ResponseInterview(BaseModel):
    acknowledgement: str = Field(
         description="A concise and natural acknowledgement of the candidate's response. "
            "It should sound like a human interviewer reacting to the answer. "
            "Do NOT ask any question here. "
            "Do NOT repeat the candidate's answer verbatim. "
            "Keep it to one sentence."
    )
    question: str = Field(
        description="Exactly one clear, concise, and relevant follow-up question for the candidate. "
            "The question must be based on the candidate's previous response, the conversation history, "
            "and the job description. "
            "Do NOT ask multiple questions. "
            "Do NOT include explanations or commentary—only the question."
    )

class CandidateScores(BaseModel):
    communication: int = Field(le=10, ge=0, description="Score from 1 to 10.")
    clarity: int = Field(le=10, ge=0, description="Score from 1 to 10.")
    role_fit: int = Field(le=10, ge=0, description="Score from 1 to 10.")
    problem_solving: int = Field(le=10, ge=0, description="Score from 1 to 10.")
    confidence: int = Field(le=10, ge=0, description="Score from 1 to 10.")
    professionalism: int = Field(le=10, ge=0, description="Score from 1 to 10.")


class CandidateReport(BaseModel):
    overall_score: int = Field(le=10, ge=0, description="Overall score from 1 to 10.")
    scores: CandidateScores
    strengths: list[str] = Field(description="Top candidate strengths.")
    concerns: list[str] = Field(description="Primary concerns or risks.")
    summary: str = Field(description="Short overall summary of candidate performance.")
    recommendation: Literal["strong_yes", "yes", "mixed", "no"] = Field(
        description="Hiring recommendation."
    )
