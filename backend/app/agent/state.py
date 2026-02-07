# backend/app/agent/state.py

from typing import TypedDict, List, Optional


class AgentState(TypedDict):
    """
    Single source of truth for the agent state.
    """

    # user input for current turn
    user_input: str

    # full conversation history
    conversation: List[str]

    # classified intent (e.g., chat, tool, clarify)
    intent: Optional[str]

    # final response returned to client
    output: str
