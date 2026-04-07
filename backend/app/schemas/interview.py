from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel


class InterviewStatus(str, Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class InterviewCreate(BaseModel):
    candidate_id: str
    job_id: str
    status: InterviewStatus = InterviewStatus.SCHEDULED
    summary: str | None = None
    report: dict[str, Any] | None = None
    transcript: list[dict[str, Any]] | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class InterviewUpdate(BaseModel):
    status: InterviewStatus | None = None
    summary: str | None = None
    report: dict[str, Any] | None = None
    transcript: list[dict[str, Any]] | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class InterviewResponse(BaseModel):
    id: str
    candidate_id: str
    job_id: str
    status: InterviewStatus
    summary: str | None
    report: dict[str, Any] | None
    transcript: list[dict[str, Any]] | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    updated_at: datetime

    model_config = {"from_attributes": True}
