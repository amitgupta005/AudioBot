"""Mock Interviews routes — self-service interview setup for candidates."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import require_candidate
from app.helpers import extract_pdf_text, get_candidate_or_404, get_interview_or_404
from app.models.candidates import Candidate
from app.models.interviews import Interview
from app.models.jobs import Job
from app.models.users import User
from app.schemas.interview import InterviewResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/mock-interviews", tags=["mock-interviews"])


@router.post("/start", status_code=status.HTTP_201_CREATED, response_model=InterviewResponse)
async def start_mock_interview(
    interview_type: str = Form(...),
    difficulty: str = Form(...),
    jd_text: Optional[str] = Form(None),
    jd_file: Optional[UploadFile] = File(None),
    resume: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_candidate),
):
    if resume.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are accepted for resume.")
    if not jd_text and not jd_file:
        raise HTTPException(status_code=400, detail="Either jd_text or jd_file must be provided.")

    try:
        resume_text_content = extract_pdf_text(await resume.read())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Resume error: {str(exc)}") from exc

    jd_content = jd_text
    if jd_file:
        if jd_file.content_type != "application/pdf":
            raise HTTPException(status_code=400, detail="Only PDF uploads are accepted for jd_file.")
        try:
            jd_content = extract_pdf_text(await jd_file.read())
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"JD error: {str(exc)}") from exc

    # Get system user
    sys_user_result = await db.execute(select(User).where(User.email == "system@audiobot.local"))
    sys_user = sys_user_result.scalar_one_or_none()
    if not sys_user:
        # Create system user if it doesn't exist
        sys_user = User(
            email="system@audiobot.local",
            password_hash="not_used",
            full_name="System Account",
            role="admin",
            is_active=False
        )
        db.add(sys_user)
        await db.flush()

    # 1. Create a system Job
    job = Job(
        title="Mock Interview",
        description="Self-service mock interview",
        raw_job_description=jd_content,
        company_id=sys_user.id,
        company_name="Noventra Practice Lab",
        is_active=False
    )
    db.add(job)
    await db.flush()

    # 2. Create Candidate
    candidate = Candidate(
        user_id=current_user.id,
        job_id=job.id,
        resume_text=resume_text_content,
        status="in_progress"
    )
    db.add(candidate)
    await db.flush()

    # 3. Create Interview
    interview = Interview(
        candidate_id=candidate.id,
        job_id=job.id,
        status="scheduled",
        interview_mode="mock",
        interview_type=interview_type,
        difficulty=difficulty
    )
    db.add(interview)
    
    await db.commit()
    
    # 4. Seed LangGraph checkpointer
    from app.dependencies import agent
    from app.config import SYSTEM_MESSAGE_HR, SYSTEM_MESSAGE_BEHAVIORAL, SYSTEM_MESSAGE_TECHNICAL
    
    config = {"configurable": {"thread_id": interview.id}}
    
    if interview_type == "behavioral":
        template = SYSTEM_MESSAGE_BEHAVIORAL
    elif interview_type == "technical":
        template = SYSTEM_MESSAGE_TECHNICAL
    else:
        template = SYSTEM_MESSAGE_HR
        
    system_msg = template.format(
        jd_text=jd_content, 
        resume_text=resume_text_content,
        difficulty=difficulty
    )
    
    new_context = {
        "jd_text": jd_content,
        "resume_text": resume_text_content,
        "interview_type": interview_type,
        "difficulty": difficulty,
        "interview_mode": "mock",
        "system_message": system_msg,
        "code_submissions": []
    }
    
    try:
        await agent.aupdate_state(config, new_context)
    except Exception as e:
        logger.warning("agent.aupdate_state failed during mock start, using fallback: %s", e)
        # fallback if state is empty
        await agent.ainvoke(new_context, config)

    created_interview = await get_interview_or_404(db, interview.id)
    return InterviewResponse.model_validate(created_interview)
