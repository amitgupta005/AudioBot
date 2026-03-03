# backend/app/agent/nodes.py

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from app.agent.state import AgentState
from app.config import GROQ_MODEL, DEFAULT_SYSTEM_PROMPT
from app.agent.tools import get_current_time
from app.agent.schema import IntentResponse, InterviewResponse

llm = ChatGroq(
    model=GROQ_MODEL,
    temperature=0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)


def intent_classifier_node(state: AgentState) -> AgentState:
    structured_llm = llm.with_structured_output(IntentResponse)
    system_instruction = (
        "You are an intent classifier. Your ONLY job is to output the correct intent in the required JSON format. "
        "Do not explain your choice."
    )
    prompt = f"""
Classification Categories:
- tool: ONLY if the user is asking for the current time.
- clarify: ONLY if the user input is complete gibberish or noise.
- chat: For all normal interview responses, greetings, and generic conversation.

User Input: "{state['user_input']}"
"""
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=prompt)
    ]
    
    response = structured_llm.invoke(messages)
    intent = response.intent
    print(f"DEBUG: User Input='{state['user_input']}' | Classified Intent='{intent}'")

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
    structured_llm = llm.with_structured_output(InterviewResponse)
    system_prompt = state.get("system_message") or DEFAULT_SYSTEM_PROMPT
    
    messages = [SystemMessage(content=system_prompt)]
    
    # Process history
    for msg in state["conversation"]:
        if msg.startswith("User: "):
            messages.append(HumanMessage(content=msg.replace("User: ", "", 1)))
        elif msg.startswith("Assistant: "):
            messages.append(AIMessage(content=msg.replace("Assistant: ", "", 1)))
            
    # Add current user input with a reminder for structured output
    instruction = (
        "\n\nIMPORTANT: You MUST provide your response in the required structured format "
        "(acknowledgement, next_question, and analysis)."
    )
    messages.append(HumanMessage(content=state['user_input'] + instruction))

    response = structured_llm.invoke(messages)
    
    # Format the final output for the user
    formatted_output = f"{response.acknowledgement}\n\n{response.next_question}"

    state["conversation"].append(f"User: {state['user_input']}")
    state["conversation"].append(f"Assistant: {formatted_output}")
    state["output"] = formatted_output
    state["acknowledgement"] = response.acknowledgement
    state["analysis"] = response.analysis.model_dump()
    print(state["analysis"])

    return state
