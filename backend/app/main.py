import io
import json
import logging
import os
from typing import Literal

import pdfplumber
from fastapi import FastAPI, WebSocket, HTTPException, UploadFile, File, Form, Depends, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


from app.core.security import (
    hash_password, 
    create_access_token, 
    get_current_user, 
    verify_password,
    require_recruiter,
    require_admin,
    require_candidate,
)
from app.core.database import get_db
from app.models.candidates import Candidate
from app.models.interviews import Interview
from app.models.jobs import Job
from app.models.loading import CANDIDATE_FULL_GRAPH, INTERVIEW_FULL_GRAPH, JOB_FULL_GRAPH
from app.models.users import User
from app.schemas.candidate import CandidateResponse, CandidateStatus, CandidateUpdate
from app.schemas.interview import InterviewCreate, InterviewResponse, InterviewStatus, InterviewUpdate
from app.schemas.job import JobCreate,JobResponse, JobUpdate
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse
from app.dependencies import agent
from app.websocket import websocket_handler
from app.config import (
    APP_NAME,
    APP_VERSION,
    CORS_ALLOW_CREDENTIALS,
    CORS_ALLOW_ORIGINS,
    SYSTEM_MESSAGE,
)

# Configure logging ONCE for the entire application
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================
# Auth Endpoints
# =====================================
@app.post("/api/v1/auth/register", status_code=status.HTTP_201_CREATED, response_model=TokenResponse)
async def register(payload: UserRegister, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    existing_user = result.scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )
    user=User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        company_name=payload.company_name,
        role=payload.role.value,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )

@app.post("/api/v1/auth/login", status_code=status.HTTP_200_OK, response_model=TokenResponse)
async def login(payload: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )

@app.get("/api/v1/auth/me", status_code=status.HTTP_200_OK, response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return current_user


#============================================
# Helper Functions
#============================================

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


# def _thread_channel_values(session_id: str) -> dict:
#     config = {"configurable": {"thread_id": session_id}}
#     checkpointer = getattr(agent, "checkpointer", None)
#     if checkpointer is None or not hasattr(checkpointer, "get_tuple"):
#         return {}

#     checkpoint_tuple = checkpointer.get_tuple(config)
#     if checkpoint_tuple and checkpoint_tuple.checkpoint:
#         return checkpoint_tuple.checkpoint.get("channel_values", {})
#     return {}


# def _initialize_thread_state(session_id: str, new_values: dict):
#     """
#     Idiomatic LangGraph: Store state in the checkpointer.
#     If the thread doesn't exist, we seed it with an initial invoke.
#     """
#     config = {"configurable": {"thread_id": session_id}}

#     try:
#         agent.update_state(config, new_values)
#         logger.info(f"Updated state for thread {session_id}")
#     except Exception:
#         logger.info(f"Initializing new thread {session_id} with state {list(new_values.keys())}")
#         initial_state = {
#             "system_message": SYSTEM_MESSAGE,
#             **new_values
#         }
#         agent.invoke(initial_state, config=config)


def _read_conversation_payload(interview_id: str):
    config = {"configurable": {"thread_id": interview_id}}
    checkpoint_tuple = agent.checkpointer.get_tuple(config)

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


# ============================================================
# Jobs API
# ============================================================

@app.post("/api/v1/jobs", status_code=status.HTTP_201_CREATED, response_model=JobResponse)
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
    # Defensive normalization for clients that still send JSON as string (e.g. "null" / "{}").
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


@app.get("/api/v1/jobs", response_model=list[JobResponse])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Job).options(*JOB_FULL_GRAPH).order_by(Job.created_at.desc())
    if current_user.is_recruiter and not current_user.is_admin:
        query = query.where(Job.company_id == current_user.id)
    result = await db.execute(query)
    jobs = result.scalars().all()
    return [JobResponse.model_validate(job) for job in jobs]


@app.get("/api/v1/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = await get_job_or_404(db, job_id)
    if current_user.is_recruiter and not current_user.is_admin and job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return JobResponse.model_validate(job)


@app.patch("/api/v1/jobs/{job_id}", response_model=JobResponse)
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


# ============================================================
# Candidates API
# ============================================================

@app.post("/api/v1/jobs/{job_id}/apply", status_code=status.HTTP_201_CREATED, response_model=CandidateResponse)
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


@app.get("/api/v1/candidates", response_model=list[CandidateResponse])
async def list_candidates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Candidate).options(*CANDIDATE_FULL_GRAPH).order_by(Candidate.created_at.desc())
    if current_user.is_candidate:
        query = query.where(Candidate.user_id == current_user.id)
    elif current_user.is_recruiter and not current_user.is_admin:
        query = query.join(Job, Candidate.job_id == Job.id).where(Job.company_id == current_user.id)
    result = await db.execute(query)
    candidates = result.scalars().all()
    return [CandidateResponse.model_validate(candidate) for candidate in candidates]


@app.get("/api/v1/candidates/{candidate_id}", response_model=CandidateResponse)
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


@app.patch("/api/v1/candidates/{candidate_id}", response_model=CandidateResponse)
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


# ============================================================
# Interviews API
# ============================================================

@app.websocket("/api/v1/interviews/{interview_id}/stream")
async def websocket_endpoint(websocket: WebSocket, interview_id: str):
    await websocket_handler(websocket, interview_id)

@app.post("/api/v1/interviews", status_code=status.HTTP_201_CREATED, response_model=InterviewResponse)
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


@app.get("/api/v1/interviews", response_model=list[InterviewResponse])
async def list_interviews(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = select(Interview).options(*INTERVIEW_FULL_GRAPH).order_by(Interview.created_at.desc())
    if current_user.is_candidate:
        query = query.join(Candidate, Interview.candidate_id == Candidate.id).where(Candidate.user_id == current_user.id)
    elif current_user.is_recruiter and not current_user.is_admin:
        query = query.join(Job, Interview.job_id == Job.id).where(Job.company_id == current_user.id)
    result = await db.execute(query)
    interviews = result.scalars().all()
    return [InterviewResponse.model_validate(interview) for interview in interviews]


@app.get("/api/v1/interviews/{interview_id}", response_model=InterviewResponse)
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


@app.patch("/api/v1/interviews/{interview_id}", response_model=InterviewResponse)
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


# ============================================================
# Admin API
# ============================================================

@app.get("/api/v1/admin/conversations", dependencies=[Depends(require_admin)])
def list_conversations():
    """
    Returns unique conversation IDs from the LangGraph checkpointer.
    """
    try:
        unique_threads = set()
        for checkpoint_tuple in agent.checkpointer.list(None):
            thread_id = checkpoint_tuple.config.get("configurable", {}).get("thread_id")
            if thread_id:
                unique_threads.add(thread_id)

        return {"conversations": sorted(list(unique_threads))}
    except Exception as e:
        logger.error(f"Error listing conversations: {e}")
        return {"conversations": []}


@app.get("/api/v1/admin/conversations/{interview_id}", dependencies=[Depends(require_admin)])
def get_conversation(interview_id: str):
    """
    Returns the conversation history and document context from the checkpointer.
    """
    try:
        return _read_conversation_payload(interview_id)
    except Exception as e:
        logger.error(f"Error reading checkpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")


@app.get("/api/v1/conversations/{interview_id}")
async def get_authenticated_conversation(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Returns the conversation history for authenticated session UIs so the frontend
    can reconcile local optimistic state with LangGraph persistence.
    """
    interview = await get_interview_or_404(db, interview_id)
    if current_user.is_candidate and interview.candidate.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    if current_user.is_recruiter and not current_user.is_admin and interview.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        return _read_conversation_payload(interview_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading checkpoint for {current_user.email}: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")


@app.get("/api/v1/admin/conversations/{interview_id}/report.pdf", dependencies=[Depends(require_admin)])
def download_conversation_report(interview_id: str):
    config = {"configurable": {"thread_id": interview_id}}
    checkpoint_tuple = agent.checkpointer.get_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
        report_pdf_path = channel_values.get("candidate_report_pdf")
        if report_pdf_path and os.path.exists(report_pdf_path):
            return FileResponse(
                report_pdf_path,
                media_type="application/pdf",
                filename=f"{interview_id}-candidate-report.pdf",
            )
        raise HTTPException(status_code=404, detail="Candidate report PDF not available")

    raise HTTPException(status_code=404, detail="Conversation not found")


@app.get("/api/v1/interviews/{interview_id}/report.pdf")
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

    config = {"configurable": {"thread_id": interview_id}}
    checkpoint_tuple = agent.checkpointer.get_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
        report_pdf_path = channel_values.get("candidate_report_pdf")
        if report_pdf_path and os.path.exists(report_pdf_path):
            return FileResponse(
                report_pdf_path,
                media_type="application/pdf",
                filename=f"{interview_id}-candidate-report.pdf",
            )
    raise HTTPException(status_code=404, detail="Candidate report PDF not available")


# ============================================================
# Recruiter API
# ============================================================

@app.get("/api/v1/recruiter/jobs", response_model=list[JobResponse])
async def recruiter_list_jobs(
    company_id: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    if company_id and not current_user.is_admin and company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = select(Job).options(*JOB_FULL_GRAPH).order_by(Job.created_at.desc())

    if current_user.is_admin:
        if company_id:
            query = query.where(Job.company_id == company_id)
    else:
        query = query.where(Job.company_id == current_user.id)

    result = await db.execute(query)
    jobs = result.scalars().all()
    return [JobResponse.model_validate(job) for job in jobs]


@app.get("/api/v1/recruiter/jobs/{job_id}/candidates", response_model=list[CandidateResponse])
async def recruiter_list_job_candidates(
    job_id: str,
    stage: Literal["all", "applied", "approved"] = "all",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    job = await get_job_or_404(db, job_id)
    if not current_user.is_admin and job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    query = (
        select(Candidate)
        .options(*CANDIDATE_FULL_GRAPH)
        .where(Candidate.job_id == job_id)
        .order_by(Candidate.created_at.desc())
    )

    if stage == "applied":
        query = query.where(Candidate.status == CandidateStatus.APPLIED.value)
    elif stage == "approved":
        query = query.where(Candidate.status.in_(("in_progress", "completed", "offered")))

    result = await db.execute(query)
    candidates = result.scalars().all()
    return [CandidateResponse.model_validate(candidate) for candidate in candidates]


@app.get("/api/v1/recruiter/interviews/{interview_id}/conversation")
async def recruiter_get_interview_conversation(
    interview_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_recruiter),
):
    interview = await get_interview_or_404(db, interview_id)
    if not current_user.is_admin and interview.job.company_id != current_user.id:
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    conversation_payload = None
    try:
        conversation_payload = _read_conversation_payload(interview_id)
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


# -----------------------
# Monitoring / Health API
# -----------------------

@app.get("/api/v1/admin/health", dependencies=[Depends(require_admin)])
def health():
    return {"status": "ok"}


@app.get("/api/v1/admin/health/llm", dependencies=[Depends(require_admin)])
def health_llm():
    try:
        from langchain_groq import ChatGroq
        from app.config import GROQ_MODEL
        llm = ChatGroq(model=GROQ_MODEL)
        llm.invoke("Hi")
        return {"llm": "reachable"}
    except Exception:
        raise HTTPException(status_code=500, detail="LLM not reachable")
