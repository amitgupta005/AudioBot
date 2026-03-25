from langchain_groq import ChatGroq
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.schema import IntentResponse
from app.agent.state import AgentState
from app.config import SYSTEM_MESSAGE, GROQ_MODEL

llm = ChatGroq(
    model=GROQ_MODEL,
    temperature=0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)


def intent_classifier_node(state: AgentState) -> dict:
    structured_llm = llm.with_structured_output(IntentResponse)
    system_instruction = """
        You are an intent classifier. Your ONLY job is to output the correct intent.
        Classification Categories:
        - clarify: ONLY if the user input is complete gibberish or noise.
        - chat: For all normal interview responses, greetings, and generic conversation.
    """
    messages = [
        SystemMessage(content=system_instruction),
        HumanMessage(content=state['user_input']),
    ]

    response = structured_llm.invoke(messages)
    return {"intent": response.intent}

def _stored_conversation(state: AgentState) -> list[BaseMessage]:
    conversation = state.get("conversation", [])
    return [msg for msg in conversation if isinstance(msg, BaseMessage)]


def clarify_node(state: AgentState) -> dict:
    response = "I'm not fully sure what you want yet. Could you please clarify or give a bit more detail?"
    conversation = list(_stored_conversation(state))
    conversation.append(HumanMessage(content=state["user_input"]))
    conversation.append(AIMessage(content=response))
    return {"conversation": conversation, "output": response}


def chat_node(state: AgentState) -> dict:
    messages = []
    
    # Filter out dummy initialization messages from history
    clean_history = [
        msg for msg in _stored_conversation(state) 
        if not (isinstance(msg, HumanMessage) and msg.content == "SYSTEM_INITIALIZATION")
    ]

    # Only add system message on first real turn
    if not clean_history:
        system_template = state.get("system_message") or SYSTEM_MESSAGE
        
        # Check if we have JD and Resume to format the template
        jd_text = state.get("jd_text")
        resume_text = state.get("resume_text")
        
        if jd_text and resume_text and "{" in system_template:
            try:
                system_content = system_template.format(jd_text=jd_text, resume_text=resume_text)
            except Exception:
                system_content = system_template
        else:
            system_content = system_template
            
        messages.append(SystemMessage(content=system_content))

    # Add cleaned conversation history
    messages.extend(clean_history)

    # Current user input (skip dummy init)
    user_input = state.get("user_input", "")
    if user_input != "SYSTEM_INITIALIZATION":
        messages.append(HumanMessage(content=user_input))
        response = llm.invoke(messages)
        output_text = response.content
        new_history = messages + [AIMessage(content=output_text)]
    else:
        output_text = "Initialized"
        new_history = messages

    return {
        "output": output_text,
        "conversation": new_history,
    }
