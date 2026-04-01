# backend/app/main.py

import asyncio
import io
import logging
import os
import pdfplumber
import httpx
from fastapi import FastAPI, WebSocket, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
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
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:5174",
        "http://localhost:5175", 
        "http://localhost:5176",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
    ],
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
            "session_id": session_id,
            "user_input": "SYSTEM_INITIALIZATION",
            "conversation": [],
            "intent": "clarify",
            "question_count": 0,
            "should_ask_followup": False,
            "interview_complete": False,
            "completion_reason": "in_progress",
            "interview_closed_at": None,
            "report_status": None,
            "candidate_report": None,
            "candidate_scores": None,
            "candidate_summary": None,
            "hiring_recommendation": None,
            "report_pdf_path": None,
            "report_download_url": None,
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


async def _sync_initial_messages_to_mongodb(session_id: str):
    """
    Sync all initial messages from Redis checkpoint to MongoDB.
    Called after thread initialization to persist initial/greeting messages.
    """
    try:
        config = {"configurable": {"thread_id": session_id}}
        checkpoint_tuple = agent.checkpointer.get_tuple(config)
        
        if checkpoint_tuple and checkpoint_tuple.checkpoint:
            channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
            conversation = channel_values.get("conversation", [])
            
            # Extract messages for syncing
            messages = []
            for msg in conversation:
                msg_type = getattr(msg, "type", "unknown")
                msg_content = getattr(msg, "content", str(msg))
                
                # Skip system initialization markers
                if msg_content == "SYSTEM_INITIALIZATION":
                    continue
                
                # Only include human and assistant messages
                if msg_type in ["human", "assistant"]:
                    messages.append({
                        "role": "user" if msg_type == "human" else "assistant",
                        "content": msg_content,
                        "type": "text"
                    })
            
            # Sync to middleware if there are messages
            if messages:
                logger.info(f"🔄 Syncing {len(messages)} initial messages from Redis to MongoDB for {session_id}")
                try:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            "http://localhost:4001/conversations/internal/sync-full-conversation",
                            json={
                                "sessionId": session_id,
                                "messages": messages,
                                "source": "python_backend_init"
                            },
                            timeout=5.0
                        )
                        logger.info(f"✅ Synced {len(messages)} initial messages to MongoDB for {session_id}")
                except Exception as e:
                    logger.warning(f"Failed to sync initial messages: {e}")
            else:
                logger.debug(f"ℹ️  No initial messages to sync for {session_id}")
    except Exception as e:
        logger.warning(f"Error syncing initial messages for {session_id}: {e}")


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
        
        # Verify or create conversation in MongoDB
        from app.services.mongo_service import MongoService
        conv = MongoService.get_conversation(session_id)
        if not conv:
            # If not found (might be a sync delay from node-middleware), create it
            # This is a fallback - ideally should be created via POST /conversations/start
            MongoService.create_conversation(session_id)
            logger.info(f"ℹ️  Created conversation {session_id} in fallback")
        
        # Initialize LangGraph thread state
        _initialize_thread_state(session_id, {"resume_text": resume_text})

        return {
            "status": "success",
            "session_id": session_id,
            "resume_chars": len(resume_text),
            "message": "Resume uploaded and stored in agent state.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Resume upload error: {e}", exc_info=True)
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
        
        # Verify or create conversation in MongoDB
        from app.services.mongo_service import MongoService
        conv = MongoService.get_conversation(session_id)
        if not conv:
            # If not found (might be a sync delay from node-middleware), create it
            # This is a fallback - ideally should be created via POST /conversations/start
            MongoService.create_conversation(session_id)
            logger.info(f"ℹ️  Created conversation {session_id} in fallback")
        
        # Initialize LangGraph thread state
        _initialize_thread_state(session_id, {"jd_text": jd_text})

        return {
            "status": "success",
            "session_id": session_id,
            "jd_chars": len(jd_text),
            "message": "Job description uploaded and stored in agent state.",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
                "question_count": channel_values.get("question_count", 0),
                "interview_complete": bool(channel_values.get("interview_complete")),
                "completion_reason": channel_values.get("completion_reason"),
                "interview_closed_at": channel_values.get("interview_closed_at"),
                "report_status": channel_values.get("report_status"),
                "candidate_report": channel_values.get("candidate_report"),
                "candidate_scores": channel_values.get("candidate_scores"),
                "candidate_summary": channel_values.get("candidate_summary"),
                "hiring_recommendation": channel_values.get("hiring_recommendation"),
                "report_pdf_path": channel_values.get("report_pdf_path"),
                "report_download_url": channel_values.get("report_download_url"),
            }
    except Exception as e:
        logger.error(f"Error reading checkpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading checkpoint: {str(e)}")

    raise HTTPException(status_code=404, detail="Conversation not found")


from datetime import datetime
from app.services.mongo_service import MongoService
from app.agent.nodes import report_generator_node

@app.post("/admin/conversation/{session_id}/report.pdf")
async def generate_conversation_report(session_id: str):
    """
    Manually triggers report generation and returns the Cloudinary link.
    """
    try:
        config = {"configurable": {"thread_id": session_id}}
        checkpoint_tuple = agent.checkpointer.get_tuple(config)
        
        if not checkpoint_tuple or not checkpoint_tuple.checkpoint:
            raise HTTPException(status_code=404, detail="Session not found.")
        
        channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
        
        # Run the generator
        # It handles PDF creation, Cloudinary upload, and MongoDB sync
        report_results = report_generator_node({**channel_values, "session_id": session_id})
        
        if report_results.get("report_status") == "error":
            raise HTTPException(status_code=500, detail="Report generation failed.")

        # Update LangGraph state so the conversation 'knows' the report is ready
        agent.update_state(config, report_results)

        return {
            "success": True,
            "session_id": session_id,
            "report_url": report_results.get("report_download_url"),
            "status": "ready"
        }
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/conversations/{conversation_id}/report-info")
def get_conversation_report_info(conversation_id: str):
    """
    Get report link from MongoDB (Primary) or Checkpoint (Fallback).
    """
    try:
        # 1. Check MongoDB First
        conv = MongoService.get_conversation(conversation_id)
        if conv and conv.get("report_url"):
            return {
                "success": True,
                "report_download_url": conv["report_url"],
                "report_status": conv.get("report_status", "ready"),
                "source": "database"
            }

        # 2. Fallback: Check LangGraph Checkpoint
        config = {"configurable": {"thread_id": conversation_id}}
        checkpoint_tuple = agent.checkpointer.get_tuple(config)
        
        if checkpoint_tuple and checkpoint_tuple.checkpoint:
            values = checkpoint_tuple.checkpoint.get("channel_values", {})
            url = values.get("report_cloudinary_url") or values.get("report_download_url")
            
            if url:
                return {
                    "success": True,
                    "report_download_url": url,
                    "report_status": values.get("report_status"),
                    "source": "checkpoint"
                }

        return {"success": False, "message": "Report not yet generated."}
        
    except Exception as e:
        logger.error(f"Error fetching report info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# ADMIN API ENDPOINTS
# ============================================================

# @app.get("/admin/conversations")
# def get_all_conversations(skip: int = 0, limit: int = 50):
#     """Get all conversations from MongoDB for admin panel"""
#     try:
#         from app.services.mongo_service import MongoService
#         result = MongoService.get_all_conversations(limit=limit, skip=skip)
#         return {
#             "success": True,
#             "conversations": result["conversations"],
#             "total": result["total"],
#             "skip": skip,
#             "limit": limit,
#         }
#     except Exception as e:
#         logger.error(f"❌ Error fetching conversations: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail=str(e))


# @app.get("/admin/conversations/{session_id}")
# def get_conversation_details(session_id: str):
#     """Get conversation details from MongoDB"""
#     try:
#         from app.services.mongo_service import MongoService
#         conversation = MongoService.get_conversation(session_id)
#         if not conversation:
#             raise HTTPException(status_code=404, detail="Conversation not found")
        
#         return {
#             "success": True,
#             "conversation": conversation,
#         }
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"❌ Error fetching conversation: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail=str(e))


# @app.post("/admin/conversation/{session_id}/report.pdf")
# def generate_conversation_report(session_id: str):
#     """Manually trigger report generation for a session"""
#     try:
#         config = {"configurable": {"thread_id": session_id}}
#         checkpoint_tuple = agent.checkpointer.get_tuple(config)
        
#         if not checkpoint_tuple or not checkpoint_tuple.checkpoint:
#             raise HTTPException(status_code=404, detail="Conversation checkpoint not found")
        
#         channel_values = checkpoint_tuple.checkpoint.get("channel_values", {})
        
#         # Check if interview is complete
#         if not channel_values.get("interview_complete"):
#             raise HTTPException(status_code=400, detail="Interview not marked as complete. Cannot generate report.")
        
#         # Import report generator node
#         from app.agent.nodes import report_generator_node
#         from app.agent.state import AgentState
        
#         # Create state dict for report generation
#         state_dict = {
#             "session_id": session_id,
#             "user_input": "",
#             "conversation": channel_values.get("conversation", []),
#             "intent": "clarify",
#             "question_count": channel_values.get("question_count", 0),
#             "should_ask_followup": False,
#             "interview_complete": True,
#             "completion_reason": channel_values.get("completion_reason", "completed_by_system"),
#             "interview_closed_at": channel_values.get("interview_closed_at"),
#             "report_status": channel_values.get("report_status"),
#             "candidate_report": channel_values.get("candidate_report"),
#             "candidate_scores": channel_values.get("candidate_scores"),
#             "candidate_summary": channel_values.get("candidate_summary"),
#             "hiring_recommendation": channel_values.get("hiring_recommendation"),
#             "report_pdf_path": channel_values.get("report_pdf_path"),
#             "report_download_url": channel_values.get("report_download_url"),
#             "report_cloudinary_url": channel_values.get("report_cloudinary_url"),
#             "jd_text": channel_values.get("jd_text", ""),
#             "resume_text": channel_values.get("resume_text", ""),
#         }
        
#         # Generate report (this will also store to MongoDB)
#         report_result = report_generator_node(state_dict)
        
#         # Also update MongoDB with the report
#         report_url = report_result.get("report_download_url") or report_result.get("report_cloudinary_url")
#         if report_url:
#             from app.services.mongo_service import MongoService
#             MongoService.update_report(session_id, report_url)
        
#         logger.info(f"✅ Report generated manually for {session_id}")
        
#         return {
#             "success": True,
#             "session_id": session_id,
#             "report": {
#                 "pdfUrl": report_result.get("report_cloudinary_url") or report_result.get("report_download_url"),
#                 "status": report_result.get("report_status"),
#                 "uploadedAt": datetime.utcnow().isoformat(),
#             }
#         }
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"❌ Error generating report for {session_id}: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")


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
