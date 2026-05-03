from typing import Literal
from pydantic import BaseModel, Field


class IntentResponse(BaseModel):
    intent: Literal["chat", "clarify"] = Field(
        description="The classified intent of the user input."
    )


class InterviewDecision(BaseModel):
    is_satisfied: bool = Field(
        description=(
            "Based on the candidate's response, decide whether the interviewer "
            "is satisfied and has enough evidence to stop the interview."
        )
    )
    satisfaction_reason: str = Field(
        description="What is the reason for the interviewer to be satisfied with the interview session"
    )


class ResponseInterview(BaseModel):
    acknowledgement: str = Field(
        description=(
            "A concise and natural acknowledgement of the candidate's response. "
            "It should sound like a human interviewer reacting to the answer. "
            "Do NOT ask any question here. "
            "Do NOT repeat the candidate's answer verbatim. "
            "Keep it to one sentence."
        )
    )
    question: str = Field(
        description=(
            "Exactly one clear, concise, and relevant follow-up question for the candidate. "
            "The question must be based on the candidate's previous response, the conversation history, "
            "and the job description. "
            "Do NOT include explanations or commentary—only the question."
        )
    )
    is_coding_challenge: bool = Field(
        default=False,
        description="Set to true ONLY if the question requires the candidate to write code to solve an algorithm or system design problem."
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
