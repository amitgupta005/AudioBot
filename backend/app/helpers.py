"""Shared helper functions used across multiple routers."""

import io
import json
import asyncio
import logging

import pdfplumber
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidates import Candidate
from app.models.interviews import Interview
from app.models.jobs import Job
from app.models.loading import CANDIDATE_FULL_GRAPH, INTERVIEW_FULL_GRAPH, JOB_FULL_GRAPH

logger = logging.getLogger(__name__)

# =====================================
# Pagination
# =====================================
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


def build_paginated_response(items: list, total: int, page: int, page_size: int) -> dict:
    """Wrap list results with pagination metadata."""
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


# =====================================
# PDF Text Extraction
# =====================================

def extract_pdf_text(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() for page in pdf.pages if page.extract_text()]
    if not pages:
        raise ValueError("No extractable text found in PDF.")
    return "\n".join(pages)


def parse_optional_json(value: str | None, field_name: str):
    if value is None or not value.strip():
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} must be valid JSON",
        ) from exc


# =====================================
# Get-or-404 Helpers
# =====================================

async def get_job_or_404(db: AsyncSession, job_id: str) -> Job:
    result = await db.execute(
        select(Job).options(*JOB_FULL_GRAPH).where(Job.id == job_id)
    )
    job = result.scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


async def get_candidate_or_404(db: AsyncSession, candidate_id: str) -> Candidate:
    result = await db.execute(
        select(Candidate).options(*CANDIDATE_FULL_GRAPH).where(Candidate.id == candidate_id)
    )
    candidate = result.scalar_one_or_none()
    if candidate is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return candidate


async def get_interview_or_404(db: AsyncSession, interview_id: str) -> Interview:
    result = await db.execute(
        select(Interview).options(*INTERVIEW_FULL_GRAPH).where(Interview.id == interview_id)
    )
    interview = result.scalar_one_or_none()
    if interview is None:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview


# =====================================
# Checkpointer Helpers
# =====================================

async def read_conversation_payload(agent, interview_id: str):
    config = {"configurable": {"thread_id": interview_id}}
    
    checkpointer = getattr(agent, "checkpointer", None)
    if checkpointer is None or not hasattr(checkpointer, "aget_tuple"):
        raise HTTPException(status_code=404, detail="Conversation not found")
        
    checkpoint_tuple = await checkpointer.aget_tuple(config)

    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
        conversation = channel_values.get("conversation", [])

        serialized = []
        for msg in conversation:
            serialized.append({
                "type": getattr(msg, "type", "unknown"),
                "data": {"content": getattr(msg, "content", str(msg))},
            })

        return {
            "interview_id": interview_id,
            "messages": serialized,
            "context": {
                "jd_text": channel_values.get("jd_text"),
                "resume_text": channel_values.get("resume_text"),
            },
            "candidate_report": channel_values.get("candidate_report"),
            "candidate_report_pdf": channel_values.get("candidate_report_pdf"),
        }

    raise HTTPException(status_code=404, detail="Conversation not found")


async def get_report_path_from_checkpointer(agent, interview_id: str) -> str | None:
    """Read the PDF report path from the checkpointer."""
    config = {"configurable": {"thread_id": interview_id}}
    checkpointer = getattr(agent, "checkpointer", None)
    if checkpointer is None or not hasattr(checkpointer, "aget_tuple"):
        return None
        
    checkpoint_tuple = await checkpointer.aget_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
        return channel_values.get("candidate_report_pdf")
    return None
