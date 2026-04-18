"""Recruiter routes — job listing, candidate listing per job, interview conversation."""

import logging
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_recruiter
from app.helpers import (
    DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
    build_paginated_response,
    get_interview_or_404,
    get_job_or_404,
    read_conversation_payload,
)
from app.models.candidates import Candidate
from app.models.jobs import Job
from app.models.loading import CANDIDATE_FULL_GRAPH, JOB_FULL_GRAPH
from app.models.users import User
from app.schemas.candidate import CandidateResponse, CandidateStatus
from app.schemas.job import JobResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/recruiter", tags=["recruiter"])


@router.get("/jobs")
async def recruiter_list_jobs(
    company_id: str | None = None,
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    if company_id and not current_user.is_admin and company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    base_query = select(Job).options(*JOB_FULL_GRAPH)

    if current_user.is_admin:
        if company_id:
            base_query = base_query.where(Job.company_id == company_id)
    else:
        base_query = base_query.where(Job.company_id == current_user.id)

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = base_query.order_by(Job.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return build_paginated_response(
        [JobResponse.model_validate(job) for job in jobs],
        total, page, page_size,
    )


@router.get("/jobs/{job_id}/candidates")
async def recruiter_list_job_candidates(
    job_id: str,
    stage: Literal["all", "applied", "approved"] = "all",
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    job = await get_job_or_404(db, job_id)
    if not current_user.is_admin and job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    base_query = (
        select(Candidate)
        .options(*CANDIDATE_FULL_GRAPH)
        .where(Candidate.job_id == job_id)
    )

    if stage == "applied":
        base_query = base_query.where(Candidate.status == CandidateStatus.APPLIED.value)
    elif stage == "approved":
        base_query = base_query.where(Candidate.status.in_(("in_progress", "completed", "offered")))

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = base_query.order_by(Candidate.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    candidates = result.scalars().all()

    return build_paginated_response(
        [CandidateResponse.model_validate(c) for c in candidates],
        total, page, page_size,
    )


@router.get("/interviews/{interview_id}/conversation")
async def recruiter_get_interview_conversation(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    interview = await get_interview_or_404(db, interview_id)
    if not current_user.is_admin and interview.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    from app.dependencies import agent

    conversation_payload = None
    try:
        conversation_payload = await read_conversation_payload(agent, interview_id)
    except HTTPException as exc:
        if exc.status_code != 404:
            raise

    return {
        "interview_id": interview.id,
        "job_id": interview.job_id,
        "candidate_id": interview.candidate_id,
        "status": interview.status,
        "transcript": interview.transcript,
        "conversation": (conversation_payload or {}).get("messages", []),
        "context": (conversation_payload or {}).get("context"),
        "candidate_report": (conversation_payload or {}).get("candidate_report"),
        "candidate_report_pdf": (conversation_payload or {}).get("candidate_report_pdf"),
    }
