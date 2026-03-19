# backend/app/main.py

import io
import logging
import pdfplumber
from fastapi import FastAPI, WebSocket, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware

from app.dependencies import agent
from app.websocket import websocket_handler
from app.config import APP_NAME, APP_VERSION, SYSTEM_MESSAGE

# Configure logging ONCE for the entire application
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_handler(websocket)


def extract_pdf_text(file_bytes: bytes) -> str:
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() for page in pdf.pages if page.extract_text()]
    if not pages:
        raise ValueError("No extractable text found in PDF.")
    return "\n".join(pages)


def _initialize_thread_state(session_id: str, new_values: dict):
    """
    Idiomatic LangGraph: Store state in the checkpointer.
    If the thread doesn't exist, we seed it with an initial invoke.
    """
    config = {"configurable": {"thread_id": session_id}}
    try:
        agent.update_state(config, new_values)
        logger.info(f"Updated state for thread {session_id}")
    except Exception:
        logger.info(f"Initializing new thread {session_id} with state {list(new_values.keys())}")
        initial_state = {
            "user_input": "SYSTEM_INITIALIZATION",
            "conversation": [],
            "intent": "clarify",
            **new_values
        }
        agent.invoke(initial_state, config=config)


def _resolve_system_message(channel_values: dict) -> dict:
    system_template = channel_values.get("system_message") or SYSTEM_MESSAGE
    jd_text = channel_values.get("jd_text")
    resume_text = channel_values.get("resume_text")

    if jd_text and resume_text and "{" in system_template:
        try:
            resolved = system_template.format(jd_text=jd_text, resume_text=resume_text)
        except Exception:
            resolved = system_template
    else:
        resolved = system_template

    return {
        "template": system_template,
        "resolved": resolved,
    }


# ============================================================
# UPLOAD ENDPOINTS
# ============================================================
@app.post("/api/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...),
    session_id: str = Form(...),
):
    if resume.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are accepted.")

    try:
        resume_bytes = await resume.read()
        resume_text = extract_pdf_text(resume_bytes)
        _initialize_thread_state(session_id, {"resume_text": resume_text})

        return {
            "status": "success",
            "session_id": session_id,
            "resume_chars": len(resume_text),
            "message": "Resume uploaded and stored in agent state.",
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@app.post("/api/upload-jd")
async def upload_jd(
    jd: UploadFile = File(...),
    session_id: str = Form(...),
):
    if jd.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF uploads are accepted.")

    try:
        jd_bytes = await jd.read()
        jd_text = extract_pdf_text(jd_bytes)
        _initialize_thread_state(session_id, {"jd_text": jd_text})

        return {
            "status": "success",
            "session_id": session_id,
            "jd_chars": len(jd_text),
            "message": "Job description uploaded and stored in agent state.",
        }
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


# -----------------------
# Admin API
# -----------------------

@app.get("/admin/conversations")
def list_conversations():
    """
    Returns unique conversation IDs from the LangGraph checkpointer.
    """
    try:
        unique_threads = set()
        for checkpoint_tuple in agent.checkpointer.list(None):
            thread_id = checkpoint_tuple.config.get("configurable", {}).get("thread_id")
            if thread_id:
                unique_threads.add(thread_id)

        return {"conversations": sorted(list(unique_threads))}
    except Exception as e:
        logger.error(f"Error listing conversations: {e}")
        return {"conversations": []}


@app.get("/admin/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    """
    Returns the conversation history and document context from the checkpointer.
    """
    try:
        config = {"configurable": {"thread_id": conversation_id}}
        checkpoint_tuple = agent.checkpointer.get_tuple(config)

        if checkpoint_tuple and checkpoint_tuple.checkpoint:
            channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
            conversation = channel_values.get("conversation", [])

            serialized = []
            for msg in conversation:
                serialized.append({
                    "type": getattr(msg, "type", "unknown"),
                    "data": {"content": getattr(msg, "content", str(msg))},
                })

            return {
                "conversation_id": conversation_id,
                "messages": serialized,
                "context": {
                    "jd_text": channel_values.get("jd_text"),
                    "resume_text": channel_values.get("resume_text"),
                },
                "system_message": _resolve_system_message(channel_values),
            }
    except Exception as e:
        logger.error(f"Error reading checkpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")

    raise HTTPException(status_code=404, detail="Conversation not found")


# -----------------------
# Monitoring / Health API
# -----------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/llm")
def health_llm():
    try:
        from langchain_groq import ChatGroq
        from app.config import GROQ_MODEL
        llm = ChatGroq(model=GROQ_MODEL)
        llm.invoke("Hi")
        return {"llm": "reachable"}
    except Exception:
        raise HTTPException(status_code=500, detail="LLM not reachable")
