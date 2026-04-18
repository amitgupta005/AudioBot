"""Interviews routes — WebSocket stream, CRUD (paginated), report download, conversation."""

import asyncio
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_recruiter
from app.helpers import (
    DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
    build_paginated_response,
    get_candidate_or_404,
    get_interview_or_404,
    get_report_path_from_checkpointer,
    read_conversation_payload,
)
from app.models.candidates import Candidate
from app.models.interviews import Interview
from app.models.jobs import Job
from app.models.loading import INTERVIEW_FULL_GRAPH
from app.models.users import User
from app.schemas.interview import InterviewCreate, InterviewResponse, InterviewStatus, InterviewUpdate
from app.websocket import websocket_handler

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/interviews", tags=["interviews"])


@router.websocket("/{interview_id}/stream")
async def websocket_endpoint(websocket: WebSocket, interview_id: str):
    await websocket_handler(websocket, interview_id)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=InterviewResponse)
async def create_interview(
    payload: InterviewCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    candidate = await get_candidate_or_404(db, payload.candidate_id)
    if candidate.job_id != payload.job_id:
        raise HTTPException(status_code=400, detail="Candidate and job do not match")
    if not current_user.is_admin and candidate.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    interview = Interview(
        candidate_id=payload.candidate_id,
        job_id=payload.job_id,
        status=payload.status.value,
        summary=payload.summary,
        report=payload.report,
        transcript=payload.transcript,
        started_at=payload.started_at,
        completed_at=payload.completed_at,
    )
    db.add(interview)
    await db.commit()
    created_interview = await get_interview_or_404(db, interview.id)
    return InterviewResponse.model_validate(created_interview)


@router.get("")
async def list_interviews(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = select(Interview).options(*INTERVIEW_FULL_GRAPH)
    if current_user.is_candidate:
        base_query = base_query.join(Candidate, Interview.candidate_id == Candidate.id).where(Candidate.user_id == current_user.id)
    elif current_user.is_recruiter and not current_user.is_admin:
        base_query = base_query.join(Job, Interview.job_id == Job.id).where(Job.company_id == current_user.id)

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = base_query.order_by(Interview.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    interviews = result.scalars().all()

    return build_paginated_response(
        [InterviewResponse.model_validate(i) for i in interviews],
        total, page, page_size,
    )


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = await get_interview_or_404(db, interview_id)
    if current_user.is_candidate and interview.candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if current_user.is_recruiter and not current_user.is_admin and interview.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return InterviewResponse.model_validate(interview)


@router.patch("/{interview_id}", response_model=InterviewResponse)
async def update_interview(
    interview_id: str,
    payload: InterviewUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    interview = await get_interview_or_404(db, interview_id)
    if not current_user.is_admin and interview.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and isinstance(update_data["status"], InterviewStatus):
        update_data["status"] = update_data["status"].value

    for field, value in update_data.items():
        setattr(interview, field, value)

    await db.commit()
    updated_interview = await get_interview_or_404(db, interview_id)
    return InterviewResponse.model_validate(updated_interview)


@router.get("/{interview_id}/report.pdf")
async def download_interview_report(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    interview = await get_interview_or_404(db, interview_id)
    if current_user.is_candidate and interview.candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if current_user.is_recruiter and not current_user.is_admin and interview.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    from app.dependencies import agent
    report_pdf_path = await get_report_path_from_checkpointer(agent, interview_id)
    if report_pdf_path and os.path.exists(report_pdf_path):
        return FileResponse(
            report_pdf_path,
            media_type="application/pdf",
            filename=f"{interview_id}-candidate-report.pdf",
        )
    raise HTTPException(status_code=404, detail="Candidate report PDF not available")
