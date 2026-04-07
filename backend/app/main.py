import io
import logging
import os
from enum import Enum
from datetime import datetime, timezone
from typing import Optional

import pdfplumber
from fastapi import FastAPI, WebSocket, HTTPException, UploadFile, File, Form, Depends, status
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import BaseMessage, SystemMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, EmailStr, field_validator


from app.core.security import (
    hash_password, 
    create_access_token, 
    get_current_user, 
    verify_password,
    require_recruiter,
    require_admin
)
from app.core.database import get_db
from app.schemas.user import UserRegister, UserLogin, UserResponse, TokenResponse
from app.dependencies import agent
from app.websocket import websocket_handler
from app.config import APP_NAME, APP_VERSION, SYSTEM_MESSAGE
from app.models.users import User

# Configure logging ONCE for the entire application
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# AUTH ROUTES
# ============================================================

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

#===============================
# API for interview
#===============================

@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_handler(websocket)


def extract_pdf_text(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() for page in pdf.pages if page.extract_text()]
    if not pages:
        raise ValueError("No extractable text found in PDF.")
    return "\n".join(pages)


def _thread_channel_values(session_id: str) -> dict:
    config = {"configurable": {"thread_id": session_id}}
    checkpointer = getattr(agent, "checkpointer", None)
    if checkpointer is None or not hasattr(checkpointer, "get_tuple"):
        return {}

    checkpoint_tuple = checkpointer.get_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        return checkpoint_tuple.checkpoint.get("channel_values", {})
    return {}


def _initialize_thread_state(session_id: str, new_values: dict):
    """
    Idiomatic LangGraph: Store state in the checkpointer.
    If the thread doesn't exist, we seed it with an initial invoke.
    """
    config = {"configurable": {"thread_id": session_id}}

    try:
        agent.update_state(config, new_values)
        logger.info(f"Updated state for thread {session_id}")
    except Exception:
        logger.info(f"Initializing new thread {session_id} with state {list(new_values.keys())}")
        initial_state = {
            "system_message": SYSTEM_MESSAGE,
            **new_values
        }
        agent.invoke(initial_state, config=config)


def _read_conversation_payload(conversation_id: str):
    config = {"configurable": {"thread_id": conversation_id}}
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
            "conversation_id": conversation_id,
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
# UPLOAD ENDPOINTS
# ============================================================
@app.post("/api/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...),
    session_id: str = Form(...),
):
    if resume.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are accepted.")

    try:
        resume_bytes = await resume.read()
        resume_text = extract_pdf_text(resume_bytes)
        _initialize_thread_state(session_id, {"resume_text": resume_text})

        return {
            "status": "success",
            "session_id": session_id,
            "resume_chars": len(resume_text),
            "resume_text": resume_text,
            "message": "Resume uploaded and stored in agent state.",
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/upload-jd")
async def upload_jd(
    jd: UploadFile = File(...),
    session_id: str = Form(...),
):
    if jd.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are accepted.")

    try:
        jd_bytes = await jd.read()
        jd_text = extract_pdf_text(jd_bytes)
        _initialize_thread_state(session_id, {"jd_text": jd_text})

        return {
            "status": "success",
            "session_id": session_id,
            "jd_chars": len(jd_text),
            "jd_text": jd_text,
            "message": "Job description uploaded and stored in agent state.",
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


# ============================================================
# Admin API
# ============================================================

@app.get("/api/v1/admin/conversations", dependencies=[Depends(require_recruiter)])
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


@app.get("/api/v1/admin/conversations/{conversation_id}", dependencies=[Depends(require_recruiter)])
def get_conversation(conversation_id: str):
    """
    Returns the conversation history and document context from the checkpointer.
    """
    try:
        return _read_conversation_payload(conversation_id)
    except Exception as e:
        logger.error(f"Error reading checkpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")


@app.get("/api/v1/conversations/{conversation_id}")
def get_authenticated_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Returns the conversation history for authenticated session UIs so the frontend
    can reconcile local optimistic state with LangGraph persistence.
    """
    try:
        return _read_conversation_payload(conversation_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading checkpoint for {current_user.email}: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")


@app.get("/api/v1/admin/conversations/{conversation_id}/report.pdf", dependencies=[Depends(require_recruiter)])
def download_conversation_report(conversation_id: str):
    config = {"configurable": {"thread_id": conversation_id}}
    checkpoint_tuple = agent.checkpointer.get_tuple(config)
    if checkpoint_tuple and checkpoint_tuple.checkpoint:
        channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
        report_pdf_path = channel_values.get("candidate_report_pdf")
        if report_pdf_path and os.path.exists(report_pdf_path):
            return FileResponse(
                report_pdf_path,
                media_type="application/pdf",
                filename=f"{conversation_id}-candidate-report.pdf",
            )
        raise HTTPException(status_code=404, detail="Candidate report PDF not available")

    raise HTTPException(status_code=404, detail="Conversation not found")


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
