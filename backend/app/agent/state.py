# backend/app/agent/state.py

from typing import List, Optional, TypedDict
from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """
    Single source of truth for the agent state.
    """

    # user input for current turn
    user_input: str
    session_id: Optional[str]

    # full conversation history
    conversation: List[BaseMessage]

    # system message instruction
    system_message: Optional[str]

    # classified intent (e.g., chat, tool, clarify)
    intent: Optional[str]

    # JD and Resume texts
    jd_text: Optional[str]
    resume_text: Optional[str]

    # final response returned to client
    output: str

    # interview lifecycle
    question_count: int
    should_ask_followup: bool
    interview_complete: bool
    completion_reason: Optional[str]
    interview_closed_at: Optional[str]

    # post-interview evaluation report
    report_status: Optional[str]
    candidate_report: Optional[dict]
    candidate_scores: Optional[dict]
    candidate_summary: Optional[str]
    hiring_recommendation: Optional[str]
    report_pdf_path: Optional[str]
    report_download_url: Optional[str]
