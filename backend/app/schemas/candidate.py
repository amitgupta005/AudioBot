from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class CandidateStatus(str, Enum):
    APPLIED = "applied"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OFFERED = "offered"
    REJECTED = "rejected"


class CandidateCreate(BaseModel):
    user_id: str
    job_id: str
    resume_text: str | None = None
    status: CandidateStatus = CandidateStatus.APPLIED
    score: float | None = None
    feedback: str | None = None


class CandidateUpdate(BaseModel):
    resume_text: str | None = None
    status: CandidateStatus | None = None
    score: float | None = None
    feedback: str | None = None


class CandidateResponse(BaseModel):
    id: str
    user_id: str
    job_id: str
    resume_text: str | None
    status: CandidateStatus
    score: float | None
    feedback: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
