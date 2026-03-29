from typing import Literal
from pydantic import BaseModel, Field, field_validator


BooleanLike = bool | Literal["true", "false", "True", "False"]


class IntentResponse(BaseModel):
    intent: Literal["chat", "clarify"] = Field(
        description="The classified intent of the user input."
    )


class InterviewDecision(BaseModel):
    is_satisfied: BooleanLike = Field(
        description="Whether the interviewer has enough evidence to stop the interview."
    )
    should_end_interview: BooleanLike = Field(
        description="Whether the interview should end on this turn."
    )
    should_ask_followup: BooleanLike = Field(
        description="Whether the interviewer should continue with another interview question."
    )
    completion_reason: Literal["in_progress", "satisfied", "max_questions"] = Field(
        description="Why the interview is continuing or ending."
    )

    @field_validator("is_satisfied", "should_end_interview", "should_ask_followup", mode="before")
    @classmethod
    def normalize_boolean_like(cls, value):
        if isinstance(value, str):
            lowered = value.strip().lower()
            if lowered == "true":
                return True
            if lowered == "false":
                return False
        return value


class CandidateScores(BaseModel):
    communication: int = Field(description="Score from 1 to 10.")
    clarity: int = Field(description="Score from 1 to 10.")
    role_fit: int = Field(description="Score from 1 to 10.")
    problem_solving: int = Field(description="Score from 1 to 10.")
    confidence: int = Field(description="Score from 1 to 10.")
    professionalism: int = Field(description="Score from 1 to 10.")


class CandidateReport(BaseModel):
    overall_score: int = Field(description="Overall score from 1 to 10.")
    scores: CandidateScores
    strengths: list[str] = Field(description="Top candidate strengths.")
    concerns: list[str] = Field(description="Primary concerns or risks.")
    summary: str = Field(description="Short overall summary of candidate performance.")
    recommendation: Literal["strong_yes", "yes", "mixed", "no"] = Field(
        description="Hiring recommendation."
    )
