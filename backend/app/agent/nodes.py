from datetime import datetime, timezone

from langchain_groq import ChatGroq
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.schema import CandidateReport, IntentResponse, InterviewDecision
from app.agent.state import AgentState
from app.config import SYSTEM_MESSAGE, GROQ_MODEL
from app.reports.pdf import build_candidate_report_pdf

llm = ChatGroq(
    model=GROQ_MODEL,
    temperature=0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)


def intent_classifier_node(state: AgentState) -> dict:
    if state.get("user_input") == "SYSTEM_INITIALIZATION":
        return {"intent": "chat"}

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


def _resolved_system_message(state: AgentState) -> str:
    system_template = state.get("system_message") or SYSTEM_MESSAGE
    jd_text = state.get("jd_text")
    resume_text = state.get("resume_text")

    if jd_text and resume_text and "{" in system_template:
        try:
            return system_template.format(jd_text=jd_text, resume_text=resume_text)
        except Exception:
            return system_template

    return system_template


def _clean_history(state: AgentState) -> list[BaseMessage]:
    return [
        msg for msg in _stored_conversation(state)
        if not (isinstance(msg, HumanMessage) and msg.content == "SYSTEM_INITIALIZATION")
    ]


def _conversation_with_resolved_system(state: AgentState) -> list[BaseMessage]:
    history = _clean_history(state)
    resolved_system = SystemMessage(content=_resolved_system_message(state))

    if history and isinstance(history[0], SystemMessage):
        history[0] = resolved_system
        return history

    return [resolved_system, *history]


def _base_messages_for_turn(state: AgentState) -> list[BaseMessage]:
    return _conversation_with_resolved_system(state)


def _with_current_user_message(messages: list[BaseMessage], state: AgentState) -> list[BaseMessage]:
    user_input = state.get("user_input", "")
    if user_input and user_input != "SYSTEM_INITIALIZATION":
        return messages + [HumanMessage(content=user_input)]
    return messages


def clarify_node(state: AgentState) -> dict:
    response = "I'm not fully sure what you want yet. Could you please clarify or give a bit more detail?"
    conversation = _conversation_with_resolved_system(state)
    conversation.append(HumanMessage(content=state["user_input"]))
    conversation.append(AIMessage(content=response))
    return {
        "conversation": conversation,
        "output": response,
        "should_ask_followup": False,
        "interview_complete": False,
        "completion_reason": "in_progress",
        "report_status": state.get("report_status"),
    }


def interview_evaluator_node(state: AgentState) -> dict:
    user_input = state.get("user_input", "")
    existing_question_count = int(state.get("question_count", 0) or 0)

    if state.get("interview_complete"):
        return {
            "should_ask_followup": False,
            "interview_complete": True,
            "completion_reason": state.get("completion_reason") or "satisfied",
            "question_count": existing_question_count,
            "report_status": state.get("report_status") or "ready",
        }

    if user_input == "SYSTEM_INITIALIZATION":
        return {
            "should_ask_followup": False,
            "interview_complete": False,
            "completion_reason": "in_progress",
            "question_count": existing_question_count,
            "report_status": state.get("report_status"),
        }

    if existing_question_count >= 10:
        return {
            "is_satisfied": True,
            "should_end_interview": True,
            "should_ask_followup": False,
            "completion_reason": "max_questions",
            "question_count": existing_question_count,
            "report_status": state.get("report_status"),
        }

    if existing_question_count < 8:
        return {
            "is_satisfied": False,
            "should_end_interview": False,
            "should_ask_followup": True,
            "completion_reason": "in_progress",
            "question_count": existing_question_count,
            "report_status": state.get("report_status"),
        }

    structured_llm = llm.with_structured_output(InterviewDecision)
    messages = _with_current_user_message(_base_messages_for_turn(state), state)
    messages.append(
        SystemMessage(
            content=(
                "You are deciding whether an HR interview should continue. "
                f"The interview has already asked {existing_question_count} questions. "
                "Rules: do not end before 8 questions, always end at 10 questions, "
                "and only continue if another question is genuinely needed to assess the candidate. "
                "Return structured output only."
            )
        )
    )
    decision = structured_llm.invoke(messages)

    should_end = decision.should_end_interview or existing_question_count >= 10
    completion_reason = decision.completion_reason
    if should_end and completion_reason == "in_progress":
        completion_reason = "satisfied"

    return {
        "is_satisfied": decision.is_satisfied,
        "should_ask_followup": False if should_end else decision.should_ask_followup,
        "interview_complete": should_end,
        "completion_reason": completion_reason,
        "question_count": existing_question_count,
        "report_status": state.get("report_status"),
    }


def ask_question_node(state: AgentState) -> dict:
    messages = _base_messages_for_turn(state)
    user_input = state.get("user_input", "")
    question_count = int(state.get("question_count", 0) or 0)

    if user_input == "SYSTEM_INITIALIZATION":
        return {
            "output": "Initialized",
            "conversation": messages,
            "question_count": question_count,
            "interview_complete": False,
            "completion_reason": "in_progress",
            "report_status": state.get("report_status"),
        }

    messages = _with_current_user_message(messages, state)
    messages.append(
        SystemMessage(
            content=(
                "You are conducting a structured HR interview. "
                "Ask exactly one substantive interview question in this reply. "
                "Do not evaluate the candidate. Do not ask multiple questions. "
                "Base the next question on the resume, JD, and prior answers."
            )
        )
    )
    response = llm.invoke(messages)
    output_text = response.content
    new_history = _conversation_with_resolved_system(state) + [
        HumanMessage(content=user_input),
        AIMessage(content=output_text),
    ]

    return {
        "output": output_text,
        "conversation": new_history,
        "question_count": question_count + 1,
        "should_ask_followup": True,
        "interview_complete": False,
        "completion_reason": "in_progress",
        "report_status": None,
    }


def close_interview_node(state: AgentState) -> dict:
    messages = _base_messages_for_turn(state)
    user_input = state.get("user_input", "")
    question_count = int(state.get("question_count", 0) or 0)
    completion_reason = state.get("completion_reason") or "satisfied"

    if user_input and user_input != "SYSTEM_INITIALIZATION":
        messages.append(HumanMessage(content=user_input))

    messages.append(
        SystemMessage(
            content=(
                "The interview is complete. Write a concise, professional closing message. "
                "Thank the candidate, state that the interview has concluded, and do not ask another question."
            )
        )
    )
    response = llm.invoke(messages)
    output_text = response.content
    new_history = _conversation_with_resolved_system(state)
    if user_input and user_input != "SYSTEM_INITIALIZATION":
        new_history.append(HumanMessage(content=user_input))
    new_history.append(AIMessage(content=output_text))

    return {
        "output": output_text,
        "conversation": new_history,
        "question_count": question_count,
        "should_ask_followup": False,
        "interview_complete": True,
        "completion_reason": completion_reason,
        "interview_closed_at": datetime.now(timezone.utc).isoformat(),
        "report_status": "pending",
    }


def report_generator_node(state: AgentState) -> dict:
    if not state.get("interview_complete"):
        return {
            "report_status": state.get("report_status"),
        }

    structured_llm = llm.with_structured_output(CandidateReport)
    conversation = _clean_history(state)
    transcript_lines = [f"{msg.type.upper()}: {msg.content}" for msg in conversation]
    prompt = "\n".join(transcript_lines) if transcript_lines else "No interview transcript available."
    report = structured_llm.invoke([
        SystemMessage(
            content=(
                "You are a hiring evaluation subagent. Evaluate the candidate using the full interview transcript, "
                "resume, and job description. Score fairly and explain the decision in the structured response."
            )
        ),
        HumanMessage(
            content=(
                f"Job description:\n{state.get('jd_text') or 'N/A'}\n\n"
                f"Resume:\n{state.get('resume_text') or 'N/A'}\n\n"
                f"Interview transcript:\n{prompt}"
            )
        ),
    ])
    report_payload = report.model_dump()
    report_pdf_path = build_candidate_report_pdf(
        session_id=state.get("session_id") or "session",
        report=report_payload,
        summary=report.summary,
        recommendation=report.recommendation,
        transcript_lines=transcript_lines,
    )
    report_download_url = f"/admin/conversations/{state.get('session_id') or 'session'}/report.pdf"

    return {
        "report_status": "ready",
        "candidate_report": report_payload,
        "candidate_scores": report.scores.model_dump(),
        "candidate_summary": report.summary,
        "hiring_recommendation": report.recommendation,
        "report_pdf_path": report_pdf_path,
        "report_download_url": report_download_url,
    }
