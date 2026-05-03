from datetime import datetime, timezone

from langchain_groq import ChatGroq
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.schema import CandidateReport, IntentResponse, InterviewDecision, ResponseInterview
from app.agent.state import AgentState
from app.config import SYSTEM_MESSAGE_HR, SYSTEM_MESSAGE_BEHAVIORAL, SYSTEM_MESSAGE_TECHNICAL, GROQ_MODEL
from app.reports.pdf import build_candidate_report_pdf

llm = ChatGroq(
    model=GROQ_MODEL,
    temperature=0,
    max_tokens=None,
    timeout=None,
    max_retries=2,
)


def intent_classifier_node(state: AgentState) -> AgentState:

    existing_question_count = int(state.get("question_count", 0) or 0)

    user_input = state.get("user_input", None)
    jd_text = state.get("jd_text", None)
    resume_text = state.get("resume_text", None)
    if user_input is None or user_input.strip() == "":
        state["intent"] = "END"
        return state
    if existing_question_count == 0 and (jd_text is None or resume_text is None):
        state["intent"] = "END"
        return state
    if existing_question_count == 0 and (jd_text is not None and resume_text is not None):
        state["intent"] = "chat"
        
        # Select system prompt based on interview type
        interview_type = state.get("interview_type")
        difficulty = state.get("difficulty") or "medium"
        
        if interview_type == "behavioral":
            template = SYSTEM_MESSAGE_BEHAVIORAL
        elif interview_type == "technical":
            template = SYSTEM_MESSAGE_TECHNICAL
        else:
            template = SYSTEM_MESSAGE_HR
            
        state["system_message"] = template.format(
            jd_text=jd_text, 
            resume_text=resume_text,
            difficulty=difficulty
        )
        state["conversation"] = [SystemMessage(content=state["system_message"])]
        state["intent"] = "chat"
        return state
    structured_llm = llm.with_structured_output(IntentResponse)
    system_instruction = """
        You are an intent classifier. Your ONLY job is to output the correct intent.
        Classification Categories:
        - clarify: ONLY if the user input is complete gibberish or noise.
        - chat: For all normal interview responses, greetings, and generic conversation.
    """
    ai_message = state.get("conversation", [])[-1].content
    messages = [
        SystemMessage(content=system_instruction),
        AIMessage(content=ai_message),
        HumanMessage(content=user_input),
    ]

    response = structured_llm.invoke(messages)
    return {"intent": response.intent}


def clarify_node(state: AgentState) -> AgentState:
    response = "I'm not fully sure what you want yet. Could you please clarify or give a bit more detail?"
    return {"output": response}


def interview_evaluator_node(state: AgentState) -> AgentState:
    user_input = state.get("user_input", "")
    existing_question_count = int(state.get("question_count", 0) or 0)
    interview_type = state.get("interview_type", "hr")
    difficulty = state.get("difficulty", "medium")

    # Dynamic limits based on interview type
    limit_map = {"hr": 8, "behavioral": 10, "technical": 12}
    max_questions = limit_map.get(interview_type, 10)

    if existing_question_count >= max_questions:
        return {"interview_complete": True}

    structured_llm = llm.with_structured_output(InterviewDecision)
    conversation = state.get("conversation", [])
    messages = [msg for msg in conversation if isinstance(msg, BaseMessage)]
    evaluator_prompt = (
        "You are deciding whether an interview should continue or conclude. "
        f"The interview type is '{interview_type}' and difficulty is '{difficulty}'. "
        f"The interview has already asked {existing_question_count} questions out of a maximum {max_questions}. "
        "CRITICAL: If the candidate is abusive, repeatedly refuses to answer, states they are unprepared, asks to stop/end the interview, or clearly gives up, YOU MUST immediately decide to conclude the interview by returning is_satisfied = True. "
        "Otherwise, evaluate whether you are satisfied with the interview till now based on the candidate's answers. "
        "Mention the reason for this decision. "
        "Return structured output only."
    )
    if messages:
        messages[0] = SystemMessage(content=evaluator_prompt)
    else:
        messages = [
            SystemMessage(content=evaluator_prompt),
            HumanMessage(content=user_input),
        ]
    decision = structured_llm.invoke(messages)

    # is_satisfied is now a native bool — no string comparison needed
    if decision.is_satisfied and existing_question_count <= max_questions:
        return {
            "interview_complete": True,
            "question_count": existing_question_count,
            "is_satisfied": True,
            "satisfaction_reason": decision.satisfaction_reason,
        }
    return {
        "interview_complete": False,
        "question_count": existing_question_count,
        "is_satisfied": decision.is_satisfied,
        "satisfaction_reason": decision.satisfaction_reason,
    }


def ask_question_node(state: AgentState) -> AgentState:
    user_input = state.get("user_input", "")
    messages = state.get("conversation", [])

    messages.append(HumanMessage(content=user_input))
    structured_llm = llm.with_structured_output(ResponseInterview)
    response = structured_llm.invoke(messages)
    
    # Check if the AI wants to do a code challenge (indicated by boolean flag)
    output_text = response.acknowledgement + "\n\n" + response.question
    if getattr(response, "is_coding_challenge", False) or "[CODE_CHALLENGE]" in output_text:
        # Prepend the tag if not already there, so the frontend detects it
        if "[CODE_CHALLENGE]" not in output_text:
            output_text = "[CODE_CHALLENGE] " + output_text
    
    new_history = messages + [AIMessage(content=output_text)]
    state["output"] = output_text
    state["conversation"] = new_history
    state["question_count"] = state.get("question_count", 0) + 1
    return state


def close_interview_node(state: AgentState) -> dict:
    messages = state.get("conversation", [])[1:]
    user_input = state.get("user_input", "")
    messages.append(HumanMessage(content=user_input))
    
    messages.insert(
        0,
        SystemMessage(
            content=(
                "The interview is complete. Write a concise, professional closing message acknowledging the candidate's last input. "
                "Thank the candidate, state that the interview has concluded, and DO NOT ask any further questions whatsoever."
            )
        ),
    )
    closing_response = llm.invoke(messages)
    output_text = closing_response.content
    messages.append(AIMessage(content=output_text))
    return {
        "output": output_text,
        "conversation": messages,
    }


def report_generator_node(state: AgentState, config) -> dict:

    structured_llm = llm.with_structured_output(CandidateReport)
    conversation = state.get("conversation", [])[1:]
    transcript_lines = [f"{msg.type.upper()}:\n  {msg.content}" for msg in conversation]
    prompt = "\n".join(transcript_lines) if transcript_lines else "No interview transcript available."
    report = structured_llm.invoke([
        SystemMessage(
            content=(
                f"You are a hiring evaluation subagent. Evaluate the candidate for a '{state.get('interview_type', 'hr')}' interview "
                f"at a '{state.get('difficulty', 'medium')}' difficulty level. Use the full interview transcript, "
                "resume, and job description. Score fairly and explain the decision in the structured response. "
                "If it was a technical interview with code challenges, evaluate code quality, problem-solving, and logic."
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
    thread_id = config.get("configurable", {}).get("thread_id", "default_session")
    report_payload = report.model_dump()
    report_pdf_path = build_candidate_report_pdf(
        session_id=thread_id,
        report=report_payload,
        summary=report.summary,
        recommendation=report.recommendation,
        transcript_lines=transcript_lines,
        interview_type=state.get("interview_type", "N/A"),
        difficulty=state.get("difficulty", "N/A"),
    )
    report_download_url = f"/api/v1/interviews/{thread_id}/report.pdf"

    return {
        "candidate_report": report_payload,
        "candidate_report_pdf": report_pdf_path,
        "report_download_url": report_download_url,
    }
