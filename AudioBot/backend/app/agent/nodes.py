# backend/app/agent/nodes.py

from langchain_community.llms import Ollama
from app.agent.state import AgentState
from app.config import OLLAMA_MODEL
from app.agent.tools import get_current_time

llm = Ollama(model=OLLAMA_MODEL)

ALLOWED_INTENTS = {"chat", "tool", "clarify"}


def intent_classifier_node(state: AgentState) -> AgentState:
    prompt = f"""
You are an intent classifier.

Labels:
- tool: ONLY for questions about the current time.
- clarify: If the user input is gibberish or impossible to understand.
- chat: For EVERYTHING else (conversations, writing essays, questions, greetings).

User input:
"{state['user_input']}"

Return ONLY the label.
"""
    # intent = llm.invoke(prompt).strip().lower()
    raw_response = llm.invoke(prompt).strip().lower()
    print(f"DEBUG: User Input='{state['user_input']}' | Raw Intent='{raw_response}'")

    if "tool" in raw_response:
        intent = "tool"
    elif "clarify" in raw_response:
        intent = "clarify"
    else:
        # Default to chat if unsure or if keyword found
        intent = "chat"

    state["intent"] = intent
    return state


def clarify_node(state: AgentState) -> AgentState:
    """
    Asks the user for clarification when input is ambiguous.
    """

    response = (
        "I’m not fully sure what you want yet. "
        "Could you please clarify or give a bit more detail?"
    )

    state["conversation"].append(f"User: {state['user_input']}")
    state["conversation"].append(f"Assistant: {response}")
    state["output"] = response

    return state


def tool_node(state: AgentState) -> AgentState:
    tool_result = get_current_time()
    response = f"The current time is {tool_result}."

    state["conversation"].append(f"User: {state['user_input']}")
    state["conversation"].append(f"Assistant: {response}")
    state["output"] = response

    return state


def chat_node(state: AgentState) -> AgentState:
    history = "\n".join(state["conversation"])
    prompt = f"""{history}
User: {state['user_input']}
Assistant:"""

    response = llm.invoke(prompt)

    state["conversation"].append(f"User: {state['user_input']}")
    state["conversation"].append(f"Assistant: {response}")
    state["output"] = response

    return state
