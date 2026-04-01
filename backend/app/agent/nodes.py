from datetime import datetime, timezone
import logging
import asyncio

from langchain_groq import ChatGroq
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.schema import CandidateReport, IntentResponse, InterviewDecision
from app.agent.state import AgentState
from app.config import SYSTEM_MESSAGE, GROQ_MODEL
from app.reports.pdf import build_candidate_report_pdf
from app.services.cloudinary_service import upload_pdf_to_cloudinary

logger = logging.getLogger(__name__)

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


def _base_messages_for_turn(state: AgentState) -> list[BaseMessage]:
    messages: list[BaseMessage] = []
    clean_history = _clean_history(state)

    if not clean_history:
        messages.append(SystemMessage(content=_resolved_system_message(state)))

    messages.extend(clean_history)
    return messages


def _with_current_user_message(messages: list[BaseMessage], state: AgentState) -> list[BaseMessage]:
    user_input = state.get("user_input", "")
    if user_input and user_input != "SYSTEM_INITIALIZATION":
        return messages + [HumanMessage(content=user_input)]
    return messages


def clarify_node(state: AgentState) -> dict:
    response = "I'm not fully sure what you want yet. Could you please clarify or give a bit more detail?"
    conversation = list(_stored_conversation(state))
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
    new_history = _clean_history(state) + [HumanMessage(content=user_input), AIMessage(content=output_text)]

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
    new_history = _clean_history(state)
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
        return {"report_status": state.get("report_status")}

    try:
        structured_llm = llm.with_structured_output(CandidateReport)
        conversation = _clean_history(state)
        transcript_lines = [f"{msg.type.upper()}: {msg.content}" for msg in conversation]
        prompt = "\n".join(transcript_lines) if transcript_lines else "No interview transcript available."
        
        session_id = state.get("session_id") or "session"
        logger.info(f"🔄 Generating report for session {session_id}")
        
        report = structured_llm.invoke([
            SystemMessage(content="Evaluate the candidate fairly based on JD, Resume, and Transcript."),
            HumanMessage(content=f"JD: {state.get('jd_text')}\nResume: {state.get('resume_text')}\nTranscript: {prompt}")
        ])
        
        report_payload = report.model_dump()
        
        # Build the PDF
        report_pdf_path = build_candidate_report_pdf(
            session_id=session_id,
            report=report_payload,
            summary=report.summary,
            recommendation=report.recommendation,
            transcript_lines=transcript_lines,
        )

        cloudinary_url = None
        try:
            cloudinary_result = upload_pdf_to_cloudinary(
                file_path=report_pdf_path,
                file_name=f"report-{session_id}"
            )
            
            if cloudinary_result.get("success"):
                cloudinary_url = cloudinary_result.get("secure_url")
        except Exception as e:
            logger.warning(f"⚠️ Cloudinary upload error: {e}")
        
        # Fallback to local path if Cloudinary fails
        report_download_url = cloudinary_url or f"/admin/conversations/{session_id}/report.pdf"
        
        # SYNC TO MONGODB: Pass the URL, Summary, and Recommendation
        # This ensures the Admin Panel has all the data it needs to display
        _sync_report_to_mongodb(
            session_id, 
            report_download_url, 
            report.summary, 
            report.recommendation
        )
        
        return {
            "report_status": "ready",
            "candidate_report": report_payload,
            "candidate_scores": report.scores.model_dump(),
            "candidate_summary": report.summary,
            "hiring_recommendation": report.recommendation,
            "report_pdf_path": report_pdf_path,
            "report_download_url": report_download_url,
            "report_cloudinary_url": cloudinary_url,
        }
    except Exception as e:
        logger.error(f"❌ Error in report_generator_node: {e}", exc_info=True)
        return {"report_status": "error"}

def _sync_report_to_mongodb(session_id: str, report_url: str, summary: str, recommendation: str):
    """Sync report data to MongoDB in a background thread."""
    def _update():
        try:
            from app.services.mongo_service import MongoService
            # Update multiple fields at once so the Admin Panel is fully populated
            update_data = {
                "report.pdfUrl": report_url,
                "report.uploadedAt": datetime.now(timezone.utc),
                "report.generatedAt": datetime.now(timezone.utc),
                "report_status": "ready",
                "candidate_summary": summary,
                "hiring_recommendation": recommendation,
            }
            # Use update_conversation or similar method that uses $set
            MongoService.update_conversation(session_id, update_data)
            logger.info(f"✅ Successfully synced report data to MongoDB for {session_id}")
        except Exception as e:
            logger.error(f"❌ MongoDB sync failed: {e}")

    import threading
    threading.Thread(target=_update, daemon=True).start()
