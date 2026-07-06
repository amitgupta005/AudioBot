# backend/app/agent/state.py

from typing import List, Optional, TypedDict
from langchain_core.messages import BaseMessage


class AgentState(TypedDict):
    """
    Single source of truth for the agent state.
    """

    # user input for current turn
    user_input: str

    # full conversation history
    conversation: List[BaseMessage]

    # system message instruction
    system_message: Optional[str]

    # classified intent (e.g., chat, tool, clarify)
    intent: Optional[str]

    # JD and Resume texts
    jd_text: Optional[str]
    resume_text: Optional[str]

    # mock interview config
    interview_type: Optional[str]
    difficulty: Optional[str]
    interview_mode: Optional[str]
    code_submissions: Optional[List[dict]]
    code_challenge_count: int

    # final response returned to client
    output: str

    # interview lifecycle
    question_count: int
    answered_count: int
    refused_count: int
    is_satisfied: bool
    satisfaction_reason: str
    interview_complete: bool
    completion_status: Optional[str]
    interview_started_at: Optional[str]
    interview_completed_at: Optional[str]

    # post-interview evaluation report
    candidate_report: Optional[dict]
    report_download_url: Optional[str]
    candidate_report_pdf: Optional[str]
