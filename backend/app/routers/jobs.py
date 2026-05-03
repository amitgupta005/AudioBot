"""Jobs routes — create, list (paginated), get, update."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user, require_recruiter
from app.helpers import (
    DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
    build_paginated_response,
    extract_pdf_text,
    get_job_or_404,
    parse_optional_json,
)
from app.models.jobs import Job
from app.models.loading import JOB_FULL_GRAPH
from app.models.users import User
from app.schemas.job import JobCreate, JobResponse, JobUpdate

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


@router.post("", status_code=status.HTTP_201_CREATED, response_model=JobResponse)
async def create_job(
    payload: JobCreate = Depends(JobCreate.as_form),
    jd_file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    if jd_file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are accepted.")

    try:
        jd_text = extract_pdf_text(await jd_file.read())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    structured_job_description = payload.structured_job_description
    if isinstance(structured_job_description, str):
        normalized = parse_optional_json(structured_job_description, "structured_job_description")
        if normalized is not None and not isinstance(normalized, dict):
            raise HTTPException(
                status_code=422,
                detail="structured_job_description must decode to a JSON object",
            )
        structured_job_description = normalized

    job = Job(
        title=payload.title,
        description=payload.description,
        raw_job_description=jd_text,
        structured_job_description=structured_job_description,
        company_id=current_user.id,
        company_name=payload.company_name if payload.company_name is not None else current_user.company_name,
    )
    db.add(job)
    await db.commit()
    created_job = await get_job_or_404(db, job.id)
    return JobResponse.model_validate(created_job)


@router.get("")
async def list_jobs(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base_query = select(Job).options(*JOB_FULL_GRAPH)
    if current_user.is_recruiter and not current_user.is_admin:
        base_query = base_query.where(Job.company_id == current_user.id)
    elif current_user.is_candidate:
        base_query = base_query.where(Job.is_active == True)

    count_query = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(count_query)).scalar_one()

    query = base_query.order_by(Job.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    jobs = result.scalars().all()

    return build_paginated_response(
        [JobResponse.model_validate(job) for job in jobs],
        total, page, page_size,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await get_job_or_404(db, job_id)
    if current_user.is_recruiter and not current_user.is_admin and job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return JobResponse.model_validate(job)


@router.patch("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: str,
    payload: JobUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    job = await get_job_or_404(db, job_id)
    if not current_user.is_admin and job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(job, field, value)

    await db.commit()
    updated_job = await get_job_or_404(db, job_id)
    return JobResponse.model_validate(updated_job)
