import json
from datetime import datetime
from typing import Any

from fastapi import Form
from pydantic import BaseModel, field_validator

class JobCreate(BaseModel):
    title: str
    description: str
    structured_job_description: dict[str, Any] | None = None
    company_name: str | None = None

    @field_validator("structured_job_description", mode="before")
    @classmethod
    def parse_structured_job_description(cls, value: Any) -> dict[str, Any] | None:
        if value is None or value == "":
            return None
        if isinstance(value, dict):
            return value
        if isinstance(value, str):
            try:
                parsed = json.loads(value)
            except json.JSONDecodeError as exc:
                raise ValueError("structured_job_description must be valid JSON") from exc
            if parsed is not None and not isinstance(parsed, dict):
                raise ValueError("structured_job_description must decode to a JSON object")
            return parsed
        raise ValueError("structured_job_description must be a JSON object or JSON string")

    @classmethod
    def as_form(
        cls,
        title: str = Form(...),
        description: str = Form(...),
        structured_job_description: str | None = Form(None),
        company_name: str | None = Form(None),
    ) -> "JobCreate":
        return cls(
            title=title,
            description=description,
            structured_job_description=structured_job_description,
            company_name=company_name,
        )

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
