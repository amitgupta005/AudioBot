"""Conversation routes — authenticated conversation history for session UIs."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.helpers import get_interview_or_404, read_conversation_payload
from app.models.users import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/conversations", tags=["conversations"])


@router.get("/{interview_id}")
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

    from app.dependencies import agent

    try:
        return await read_conversation_payload(agent, interview_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error reading checkpoint for %s: %s", current_user.email, e)
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")
