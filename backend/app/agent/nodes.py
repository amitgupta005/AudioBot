from datetime import datetime, timezone
import logging
import re

from langchain_google_vertexai import ChatVertexAI
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.agent.schema import CandidateReport, InterviewDecision, ResponseInterview
from app.agent.state import AgentState
from app.config import (
    SYSTEM_MESSAGE_HR, SYSTEM_MESSAGE_BEHAVIORAL, SYSTEM_MESSAGE_TECHNICAL,
    VERTEX_AI_MODEL_CHAT, VERTEX_AI_MODEL_REASONING, VERTEX_AI_PROJECT, VERTEX_AI_LOCATION
)
from app.reports.pdf import build_candidate_report_pdf


_REFUSAL_RE = re.compile(
    r"\b(skip|move on|not relevant|irrelevant|don't want|do not want|won't answer|"
    r"will not answer|refuse|stop asking|stop and exit|end interview|exit)\b",
    re.IGNORECASE,
)
_TERMINATION_RE = re.compile(
    r"\b(stop and exit|stop the interview|end the interview|exit interview|quit|i'?m done|"
    r"do not continue|don't continue|terminate)\b",
    re.IGNORECASE,
)
_VAGUE_OR_DEFLECTED_RE = re.compile(
    r"\b(i don't know|idk|not sure|maybe|whatever|as i said|already answered|"
    r"specific quality|nothing else|no comment|pass|next question|move on)\b",
    re.IGNORECASE,
)
_DISFLUENCY_RE = re.compile(r"\b(uh+|um+|erm+|ah+|hmm+)\b[,\s]*", re.IGNORECASE)


def _is_refusal_or_pushback(text: str) -> bool:
    return bool(_REFUSAL_RE.search(text or ""))


def _is_candidate_termination(text: str) -> bool:
    return bool(_TERMINATION_RE.search(text or ""))


def _is_substantive_answer(text: str) -> bool:
    normalized = (text or "").strip()
    if not normalized or _is_refusal_or_pushback(normalized):
        return False
    words = re.findall(r"[A-Za-z0-9']+", normalized)
    if len(words) < 12:
        return False
    if _VAGUE_OR_DEFLECTED_RE.search(normalized) and len(words) < 30:
        return False
    return True


def _clean_for_report(text: str) -> str:
    cleaned = _DISFLUENCY_RE.sub("", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def _message_role(message: BaseMessage) -> str:
    message_type = getattr(message, "type", "unknown")
    if message_type == "human":
        return "Candidate"
    if message_type == "ai":
        return "Interviewer"
    if message_type == "system":
        return "System"
    return message_type.title()


def _format_transcript_lines(conversation: list[BaseMessage]) -> list[str]:
    lines = []
    turn_number = 1
    for message in conversation:
        if getattr(message, "type", None) == "system":
            continue
        role = _message_role(message)
        lines.append(f"Turn {turn_number} - {role}:\n  {_clean_for_report(str(message.content))}")
        turn_number += 1
    return lines


logger = logging.getLogger(__name__)

llm_chat = ChatVertexAI(
    model_name=VERTEX_AI_MODEL_CHAT,
    project=VERTEX_AI_PROJECT,
    location=VERTEX_AI_LOCATION,
    temperature=0,
    max_retries=2,
    max_output_tokens=2048,
)

llm_reasoning = ChatVertexAI(
    model_name=VERTEX_AI_MODEL_REASONING,
    project=VERTEX_AI_PROJECT,
    location=VERTEX_AI_LOCATION,
    temperature=0,
    max_retries=2,
    max_output_tokens=8192,
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
    # ── LOCAL HEURISTIC (replaces LLM call) ──────────────────────
    # In a structured interview, 99%+ of candidate responses are
    # normal conversation. Only truly unintelligible noise should
    # be routed to "clarify". A simple word-count check is enough.
    words = re.findall(r"[A-Za-z0-9']+", user_input)
    if len(words) >= 3:
        logger.debug("Intent classifier: local heuristic → chat (%d words)", len(words))
        return {"intent": "chat"}

    # Very short input (1-2 words) — still almost always chat,
    # but check for pure noise (e.g. just "asdfgh")
    if len(words) >= 1 and any(len(w) > 1 for w in words):
        logger.debug("Intent classifier: short input → chat (%d words)", len(words))
        return {"intent": "chat"}

    # Truly empty or single-character gibberish
    logger.debug("Intent classifier: local heuristic → clarify (input too short/noisy)")
    return {"intent": "clarify"}


def clarify_node(state: AgentState) -> AgentState:
    response = "I'm not fully sure what you want yet. Could you please clarify or give a bit more detail?"
    return {"output": response}


def interview_evaluator_node(state: AgentState) -> AgentState:
    user_input = state.get("user_input", "")
    existing_question_count = int(state.get("question_count", 0) or 0)
    interview_type = state.get("interview_type", "hr")
    difficulty = state.get("difficulty", "medium")
    refused_count = int(state.get("refused_count", 0) or 0)
    refusal_on_turn = _is_refusal_or_pushback(user_input)
    next_refused_count = refused_count + (1 if refusal_on_turn else 0)

    # Dynamic limits based on interview type
    limit_map = {"hr": 8, "behavioral": 10, "technical": 12}
    max_questions = limit_map.get(interview_type, 10)

    if existing_question_count >= max_questions:
        return {
            "interview_complete": True,
            "completion_status": "completed",
            "interview_completed_at": datetime.now(timezone.utc).isoformat(),
        }

    if _is_candidate_termination(user_input):
        return {
            "interview_complete": True,
            "completion_status": "candidate_terminated",
            "interview_completed_at": datetime.now(timezone.utc).isoformat(),
            "question_count": existing_question_count,
            "is_satisfied": False,
            "refused_count": refused_count + 1,
            "satisfaction_reason": "Candidate explicitly asked to stop or exit the interview.",
        }

    if refusal_on_turn and next_refused_count < 3:
        return {
            "interview_complete": False,
            "completion_status": "in_progress",
            "question_count": existing_question_count,
            "is_satisfied": False,
            "refused_count": next_refused_count,
            "satisfaction_reason": "Candidate pushed back or refused; continue with a professional recovery follow-up before ending.",
        }

    # ── EARLY-TURN SKIP (eliminates evaluator LLM call for Q0-Q3) ──
    # Before question 4, the evaluator will almost never conclude
    # the interview. The refusal/termination regex above already
    # catches explicit stop requests, so we can safely skip the
    # expensive LLM reasoning call for the first few turns.
    MIN_EVAL_THRESHOLD = 4
    if existing_question_count < MIN_EVAL_THRESHOLD:
        logger.debug(
            "Evaluator: skipping LLM call (question %d < threshold %d)",
            existing_question_count, MIN_EVAL_THRESHOLD,
        )
        return {
            "interview_complete": False,
            "completion_status": "in_progress",
            "question_count": existing_question_count,
            "is_satisfied": False,
            "refused_count": next_refused_count,
            "satisfaction_reason": "Interview in early phase; continuing.",
        }

    structured_llm = llm_reasoning.with_structured_output(InterviewDecision)
    conversation = state.get("conversation", [])
    messages = [msg for msg in conversation if isinstance(msg, BaseMessage)]
    evaluator_prompt = (
        "You are deciding whether an interview should continue or conclude. "
        f"The interview type is '{interview_type}' and difficulty is '{difficulty}'. "
        f"The interview has already asked {existing_question_count} questions out of a maximum {max_questions}. "
        f"The candidate has refused, deflected, or pushed back {next_refused_count} time(s). "
        "CRITICAL: If the candidate asks to stop/end/exit the interview, set completion_status to candidate_terminated and is_satisfied to the string 'true'. "
        "If the candidate has refused or deflected fewer than 3 times, continue the interview with a professional recovery question. "
        "If the candidate has refused or deflected 3 or more times, set completion_status to partial and is_satisfied to the string 'true'. "
        "Otherwise, evaluate whether there is enough evidence to conclude the interview based on the candidate's answers. "
        "Do not treat vague or evasive answers as satisfactory evidence unless enough competency areas have already been tested. "
        "Return structured output only. is_satisfied must be the string 'true' or 'false'."
    )
    if messages:
        messages[0] = SystemMessage(content=evaluator_prompt)
    else:
        messages = [
            SystemMessage(content=evaluator_prompt),
            HumanMessage(content=user_input),
        ]
    decision = structured_llm.invoke(messages)

    is_satisfied_bool = str(decision.is_satisfied).strip().lower() == "true"
    completion_status = getattr(decision, "completion_status", "completed" if is_satisfied_bool else "in_progress")
    if completion_status == "candidate_terminated":
        is_satisfied_bool = True

    if is_satisfied_bool and existing_question_count <= max_questions:
        return {
            "interview_complete": True,
            "completion_status": completion_status if completion_status != "in_progress" else "completed",
            "interview_completed_at": datetime.now(timezone.utc).isoformat(),
            "question_count": existing_question_count,
            "is_satisfied": True,
            "satisfaction_reason": decision.satisfaction_reason,
            "refused_count": next_refused_count,
        }
    return {
        "interview_complete": False,
        "completion_status": "in_progress",
        "question_count": existing_question_count,
        "is_satisfied": is_satisfied_bool,
        "satisfaction_reason": decision.satisfaction_reason,
        "refused_count": next_refused_count,
    }


def ask_question_node(state: AgentState) -> AgentState:
    user_input = state.get("user_input", "")
    messages = state.get("conversation", [])
    started_at = state.get("interview_started_at") or datetime.now(timezone.utc).isoformat()

    if not user_input or user_input.strip() == "":
        if state.get("question_count", 0) == 0:
            user_input = "Hello, I am ready to begin the interview."
        else:
            user_input = "(No audible response)"

    messages.append(HumanMessage(content=user_input))
    structured_llm = llm_chat.with_structured_output(ResponseInterview)
    response = structured_llm.invoke(messages)
    
    # Check if the AI wants to do a code challenge (is_coding_challenge is a string 'true'/'false')
    output_text = response.acknowledgement + "\n\n" + response.question
    is_code = str(getattr(response, "is_coding_challenge", "false")).strip().lower() == "true"
    if is_code or "[CODE_CHALLENGE]" in output_text:
        # Prepend the tag if not already there, so the frontend detects it
        if "[CODE_CHALLENGE]" not in output_text:
            output_text = "[CODE_CHALLENGE] " + output_text
    
    new_history = messages + [AIMessage(content=output_text)]
    state["output"] = output_text
    state["conversation"] = new_history
    state["question_count"] = state.get("question_count", 0) + 1
    state["answered_count"] = int(state.get("answered_count", 0) or 0) + (
        1 if _is_substantive_answer(user_input) else 0
    )
    state["interview_started_at"] = started_at
    state["completion_status"] = "in_progress"
    if is_code or "[CODE_CHALLENGE]" in output_text:
        state["code_challenge_count"] = int(state.get("code_challenge_count", 0) or 0) + 1
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
    closing_response = llm_chat.invoke(messages)
    output_text = closing_response.content
    messages.append(AIMessage(content=output_text))
    completion_status = state.get("completion_status") or "completed"
    return {
        "output": output_text,
        "conversation": messages,
        "completion_status": completion_status,
        "interview_complete": True,
        "interview_completed_at": state.get("interview_completed_at") or datetime.now(timezone.utc).isoformat(),
    }


def report_generator_node(state: AgentState, config) -> dict:

    structured_llm = llm_reasoning.with_structured_output(CandidateReport)
    conversation = state.get("conversation", [])[1:]
    transcript_lines = _format_transcript_lines(conversation)
    prompt = "\n".join(transcript_lines) if transcript_lines else "No interview transcript available."
    question_count = int(state.get("question_count", 0) or 0)
    refused_count = int(state.get("refused_count", 0) or 0)
    answered_count = int(state.get("answered_count", 0) or 0)
    completion_status = state.get("completion_status") or "completed"
    generated_at = datetime.now(timezone.utc).isoformat()
    low_confidence_reasons = []
    if question_count < 4:
        low_confidence_reasons.append("fewer than 4 questions were asked")
    if answered_count < 3:
        low_confidence_reasons.append("fewer than 3 substantive answers were captured")
    if completion_status in {"partial", "candidate_terminated"}:
        low_confidence_reasons.append(f"the interview status is {completion_status.replace('_', ' ')}")
    data_confidence_warning = None
    if low_confidence_reasons:
        data_confidence_warning = "Limited evidence: " + "; ".join(low_confidence_reasons) + ". Treat scores as directional, not definitive."
    report_system_prompt = (
        f"You are an expert technical recruiter and hiring manager. Evaluate the candidate for a '{state.get('interview_type', 'hr')}' interview "
        f"at a '{state.get('difficulty', 'medium')}' difficulty level. Use the full interview transcript, "
        "resume, and job description. The resume and job description are valid context for role_fit, while the transcript controls communication, clarity, professionalism, problem_solving, and confidence.\n\n"
        "CRITICAL INSTRUCTIONS:\n"
        "1. Calibrate scores harshly when the transcript is vague, evasive, abusive, incomplete, or candidate-terminated. Do not mark a vague/deflected turn as answered evidence.\n"
        "2. Do not quote speech-to-text filler words such as 'uh', 'um', or repeated false starts. Paraphrase disfluent STT output unless a short cleaned quote is essential.\n"
        "3. Score role_fit from JD/resume alignment plus any role-relevant transcript evidence. Do not lower role_fit solely because the interview was short, but do lower it if behavior, refusal, or answers undermine fit.\n"
        "4. If completion_status is candidate_terminated or partial, state that plainly in the summary, recommendation rationale, and concerns, and penalize professionalism, clarity, confidence, and overall_score.\n"
        "5. If a data confidence warning is provided, include it verbatim in data_confidence_warning and reflect uncertainty in the summary.\n"
        "6. DO NOT output short bullet points. Strengths and concerns must be detailed paragraphs, but avoid repeating the same example across sections.\n"
        "7. Use specific examples from the transcript, but prefer paraphrase or short cleaned excerpts over raw STT quotes.\n"
        "8. Keep the summary direct and non-repetitive. Avoid stock phrases like 'highly concerning' or 'critical deficiencies' more than once.\n"
        "9. If technical, heavily evaluate code quality and logic only when code or technical answers were actually provided. If code submissions are attached, assess correctness, edge cases, complexity, and style. If not tested, say evidence was insufficient and score accordingly.\n"
        "10. Use the five-tier recommendation exactly: strong_no, no, maybe, yes, strong_yes."
    )

    # Build the human prompt content with optional code submissions
    human_prompt = (
        f"Job description:\n{state.get('jd_text') or 'N/A'}\n\n"
        f"Resume:\n{state.get('resume_text') or 'N/A'}\n\n"
        f"Interview metadata:\n"
        f"- completion_status: {completion_status}\n"
        f"- questions_asked: {question_count}\n"
        f"- answered_count_estimate: {answered_count}\n"
        f"- refused_or_pushback_count_estimate: {refused_count}\n"
        f"- code_challenges_asked: {int(state.get('code_challenge_count', 0) or 0)}\n"
        f"- code_submissions_received: {len(state.get('code_submissions') or [])}\n"
        f"- data_confidence_warning: {data_confidence_warning or 'N/A'}\n"
        f"- started_at: {state.get('interview_started_at') or 'N/A'}\n"
        f"- completed_at: {state.get('interview_completed_at') or generated_at}\n\n"
    )
    code_submissions = state.get("code_submissions") or []
    if code_submissions:
        code_parts = []
        for i, sub in enumerate(code_submissions, 1):
            lang = sub.get("language", "unknown")
            code_parts.append(f"Submission {i} ({lang}):\n```{lang}\n{sub.get('code', '')}\n```")
        human_prompt += f"Code Submissions ({len(code_submissions)} total):\n" + "\n\n".join(code_parts) + "\n\n"
    human_prompt += f"Interview transcript:\n{prompt}"

    report = structured_llm.invoke([
        SystemMessage(content=report_system_prompt),
        HumanMessage(content=human_prompt),
    ])
    thread_id = config.get("configurable", {}).get("thread_id", "default_session")
    report_payload = report.model_dump()
    report_payload["completion_status"] = completion_status
    report_payload["questions_asked"] = question_count
    report_payload["answered_count_estimate"] = answered_count
    report_payload["refused_or_pushback_count_estimate"] = refused_count
    report_payload["data_confidence_warning"] = report_payload.get("data_confidence_warning") or data_confidence_warning
    report_payload["generated_at"] = generated_at
    report_payload["interview_started_at"] = state.get("interview_started_at")
    report_payload["interview_completed_at"] = state.get("interview_completed_at") or generated_at
    if state.get("interview_started_at"):
        try:
            started_at_dt = datetime.fromisoformat(state["interview_started_at"].replace("Z", "+00:00"))
            completed_at_dt = datetime.fromisoformat(report_payload["interview_completed_at"].replace("Z", "+00:00"))
            report_payload["duration_seconds"] = max(0, int((completed_at_dt - started_at_dt).total_seconds()))
        except ValueError:
            report_payload["duration_seconds"] = None
    report_pdf_path = build_candidate_report_pdf(
        session_id=thread_id,
        report=report_payload,
        summary=report.summary,
        recommendation=report.recommendation,
        transcript_lines=transcript_lines,
        interview_type=state.get("interview_type", "N/A"),
        difficulty=state.get("difficulty", "N/A"),
        completion_status=completion_status,
        generated_at=generated_at,
        started_at=state.get("interview_started_at"),
        completed_at=state.get("interview_completed_at") or generated_at,
        question_count=question_count,
        answered_count=answered_count,
        refused_count=refused_count,
        data_confidence_warning=report_payload.get("data_confidence_warning"),
    )
    report_download_url = f"/api/v1/interviews/{thread_id}/report.pdf"

    return {
        "candidate_report": report_payload,
        "candidate_report_pdf": report_pdf_path,
        "report_download_url": report_download_url,
    }
