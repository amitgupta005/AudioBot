"""Candidates routes — apply, list (paginated), get, update."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_candidate
from app.helpers import (
    DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
    build_paginated_response,
    extract_pdf_text,
    get_candidate_or_404,
    get_job_or_404,
    parse_optional_json,
)
from app.models.candidates import Candidate
from app.models.jobs import Job
from app.models.loading import CANDIDATE_FULL_GRAPH
from app.models.users import User
from app.schemas.candidate import CandidateResponse, CandidateStatus, CandidateUpdate

router = APIRouter(tags=["candidates"])


@router.post("/api/v1/jobs/{job_id}/apply", status_code=status.HTTP_201_CREATED, response_model=CandidateResponse)
async def apply_for_job(
    job_id: str,
    resume: UploadFile = File(...),
    structured_resume: str | None = Form(None),
    status_value: CandidateStatus = Form(CandidateStatus.APPLIED),
    score: float | None = Form(None),
    feedback: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_candidate),
):
    if resume.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are accepted.")

    job = await get_job_or_404(db, job_id)
    existing_result = await db.execute(
        select(Candidate).where(
            Candidate.user_id == current_user.id,
            Candidate.job_id == job_id,
        )
    )
    existing_candidate = existing_result.scalar_one_or_none()
    if existing_candidate:
        raise HTTPException(status_code=400, detail="You have already applied to this job")

    try:
        resume_text = extract_pdf_text(await resume.read())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    candidate = Candidate(
        user_id=current_user.id,
        job_id=job.id,
        resume_text=resume_text,
        structured_resume=parse_optional_json(structured_resume, "structured_resume"),
        status=status_value.value,
        score=score,
        feedback=feedback,
    )
    db.add(candidate)
    await db.commit()
    created_candidate = await get_candidate_or_404(db, candidate.id)
    return CandidateResponse.model_validate(created_candidate)


@router.get("/api/v1/candidates")
async def list_candidates(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = select(Candidate).options(*CANDIDATE_FULL_GRAPH)
    if current_user.is_candidate:
        base_query = base_query.where(Candidate.user_id == current_user.id)
    elif current_user.is_recruiter and not current_user.is_admin:
        base_query = base_query.join(Job, Candidate.job_id == Job.id).where(Job.company_id == current_user.id)

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = base_query.order_by(Candidate.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    candidates = result.scalars().all()

    return build_paginated_response(
        [CandidateResponse.model_validate(c) for c in candidates],
        total, page, page_size,
    )


@router.get("/api/v1/candidates/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(
    candidate_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = await get_candidate_or_404(db, candidate_id)
    if current_user.is_candidate and candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if current_user.is_recruiter and not current_user.is_admin and candidate.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return CandidateResponse.model_validate(candidate)


@router.patch("/api/v1/candidates/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: str,
    payload: CandidateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    candidate = await get_candidate_or_404(db, candidate_id)
    if current_user.is_candidate and candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if current_user.is_recruiter and not current_user.is_admin and candidate.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = payload.model_dump(exclude_unset=True)
    if "status" in update_data and isinstance(update_data["status"], CandidateStatus):
        update_data["status"] = update_data["status"].value

    for field, value in update_data.items():
        setattr(candidate, field, value)

    await db.commit()
    updated_candidate = await get_candidate_or_404(db, candidate_id)
    return CandidateResponse.model_validate(updated_candidate)
