from typing import Literal
from pydantic import BaseModel, Field


class IntentResponse(BaseModel):
    intent: Literal["chat", "clarify"] = Field(
        description="The classified intent of the user input."
    )


class InterviewDecision(BaseModel):
    is_satisfied: str = Field(
        description=(
            "Based on the candidate's response, decide whether the interviewer "
            "is satisfied and has enough evidence to stop the interview. "
            "MUST be the string 'true' or 'false'."
        )
    )
    completion_status: Literal["in_progress", "completed", "candidate_terminated", "partial"] = Field(
        default="in_progress",
        description=(
            "Use candidate_terminated when the candidate asks to stop, exit, end the interview, "
            "or repeatedly refuses to continue. Use partial when the session ends without enough "
            "evidence for a complete evaluation."
        ),
    )
    satisfaction_reason: str = Field(
        description="What is the reason for the interviewer to be satisfied with the interview session"
    )
    termination_reason: str | None = Field(
        default=None,
        description="If completion_status is candidate_terminated or partial, briefly explain why.",
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
    is_coding_challenge: str = Field(
        default="false",
        description=(
            "Set to the string 'true' ONLY if the question requires the candidate "
            "to write code to solve an algorithm or system design problem. "
            "Must be the string 'true' or 'false'."
        )
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
    strengths: list[str] = Field(description="A list of full paragraphs (minimum 3 sentences each) detailing the candidate's strengths. Use specific examples from the transcript; quote only short cleaned excerpts when useful.")
    concerns: list[str] = Field(description="A list of full paragraphs (minimum 3 sentences each) detailing the candidate's weaknesses or risks. Use specific examples from the transcript; quote only short cleaned excerpts when useful.")
    summary: str = Field(description="A long, highly detailed multi-paragraph summary of the candidate's overall performance.")
    data_confidence_warning: str | None = Field(
        default=None,
        description="Warning shown when the interview is short, partial, candidate-terminated, or has too little evidence for confident scoring.",
    )
    recommendation: Literal["strong_no", "no", "maybe", "yes", "strong_yes"] = Field(
        description="Five-tier hiring recommendation."
    )
    recommendation_rationale: str = Field(
        description="A concise rationale for the recommendation, including whether the interview was complete or partial."
    )
    candidate_feedback: str = Field(
        description="Candidate-facing feedback written professionally and constructively."
    )
