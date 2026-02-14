# backend/app/agent/nodes.py

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from app.agent.state import AgentState
from app.config import GROQ_MODEL, DEFAULT_SYSTEM_PROMPT
from app.agent.tools import get_current_time

llm = ChatGroq(
    model=GROQ_MODEL,
    temperature=0,
    max_tokens=None,
    reasoning_format="parsed",
    timeout=None,
    max_retries=2,
)

ALLOWED_INTENTS = {"chat", "tool", "clarify"}


def intent_classifier_node(state: AgentState) -> AgentState:
    system_instruction = "You are an intent classifier."
    prompt = f"""
Labels:
- tool: ONLY for questions about the current time.
- clarify: If the user input is gibberish or impossible to understand.
- chat: For EVERYTHING else (conversations, writing essays, questions, greetings).

User input:
"{state['user_input']}"

Return ONLY the label.
"""
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=prompt)
    ]
    
    raw_response = llm.invoke(messages).content.strip().lower()
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
    system_prompt = state.get("system_message") or DEFAULT_SYSTEM_PROMPT
    
    messages = [SystemMessage(content=system_prompt)]
    
    # Process history
    for msg in state["conversation"]:
        if msg.startswith("User: "):
            messages.append(HumanMessage(content=msg.replace("User: ", "", 1)))
        elif msg.startswith("Assistant: "):
            messages.append(AIMessage(content=msg.replace("Assistant: ", "", 1)))
            
    # Add current user input
    messages.append(HumanMessage(content=state['user_input']))

    response = llm.invoke(messages).content

    state["conversation"].append(f"User: {state['user_input']}")
    state["conversation"].append(f"Assistant: {response}")
    state["output"] = response

    return state
