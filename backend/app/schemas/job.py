from datetime import datetime
from typing import Any

from pydantic import BaseModel

class JobCreate(BaseModel):
    title: str
    description: str
    raw_job_description: str
    structured_job_description: dict[str, Any] | None = None
    company_name: str | None = None

class JobResponse(BaseModel):
    id: str
    title: str
    description: str
    raw_job_description: str
    structured_job_description: dict[str, Any] | None
    company_id: str
    company_name: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

class JobUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    raw_job_description: str | None = None
    structured_job_description: dict[str, Any] | None = None
    company_name: str | None = None
    is_active: bool | None = None
