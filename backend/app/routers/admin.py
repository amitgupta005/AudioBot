"""Admin routes — conversation management, reports, health checks."""

import asyncio
import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from app.core.security import require_admin
from app.helpers import get_report_path_from_checkpointer, read_conversation_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


@router.get("/conversations", dependencies=[Depends(require_admin)])
async def list_conversations():
    """Returns unique conversation IDs from the LangGraph checkpointer."""
    from app.dependencies import agent

    try:
        def _list_threads():
            unique_threads = set()
            for checkpoint_tuple in agent.checkpointer.list(None):
                thread_id = checkpoint_tuple.config.get("configurable", {}).get("thread_id")
                if thread_id:
                    unique_threads.add(thread_id)
            return sorted(list(unique_threads))

        threads = await asyncio.to_thread(_list_threads)
        return {"conversations": threads}
    except Exception as e:
        logger.error("Error listing conversations: %s", e)
        return {"conversations": []}


@router.get("/conversations/{interview_id}", dependencies=[Depends(require_admin)])
async def get_conversation(interview_id: str):
    """Returns the conversation history and document context from the checkpointer."""
    from app.dependencies import agent

    try:
        return await read_conversation_payload(agent, interview_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error reading checkpoint: %s", e)
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")


@router.get("/conversations/{interview_id}/report.pdf", dependencies=[Depends(require_admin)])
async def download_conversation_report(interview_id: str):
    from app.dependencies import agent

    report_pdf_path = await get_report_path_from_checkpointer(agent, interview_id)
    if report_pdf_path and os.path.exists(report_pdf_path):
        return FileResponse(
            report_pdf_path,
            media_type="application/pdf",
            filename=f"{interview_id}-candidate-report.pdf",
        )
    raise HTTPException(status_code=404, detail="Candidate report PDF not available")


@router.get("/health", dependencies=[Depends(require_admin)])
async def health():
    return {"status": "ok"}


@router.get("/health/llm", dependencies=[Depends(require_admin)])
async def health_llm(request: Request):
    def _check_llm():
        from langchain_groq import ChatGroq
        from app.config import GROQ_MODEL
        llm = ChatGroq(model=GROQ_MODEL)
        llm.invoke("Hi")

    try:
        await asyncio.to_thread(_check_llm)
        return {"llm": "reachable"}
    except Exception:
        raise HTTPException(status_code=500, detail="LLM not reachable")
