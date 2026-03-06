# # backend/app/main.py

# from langchain_core.messages import SystemMessage

# from fastapi import FastAPI, WebSocket, HTTPException
# from fastapi.middleware.cors import CORSMiddleware
# from app.websocket import websocket_handler
# from app.config import APP_NAME, APP_VERSION
# from app.memory.store import MemoryStore

# import io
# import PyPDF2
# from fastapi import  UploadFile, File, Form


# app = FastAPI(title=APP_NAME, version=APP_VERSION)

# # Enable CORS
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],  # For development, allow all origins
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )

# memory = MemoryStore()


# @app.websocket("/ws")
# async def websocket_endpoint(websocket: WebSocket):
#     await websocket_handler(websocket)


# # -----------------------
# # Admin API (Read-only)
# # -----------------------

# @app.get("/admin/conversations")
# def list_conversations():
#     """
#     Returns all known conversation IDs.
#     """
#     return {
#         "conversations": memory.list_conversations()
#     }


# @app.get("/admin/conversations/{conversation_id}")
# def get_conversation(conversation_id: str):
#     """
#     Returns the conversation history for a given ID.
#     """
#     conversation = memory.get_conversation(conversation_id)

#     if not conversation:
#         raise HTTPException(status_code=404, detail="Conversation not found")

#     return {
#         "conversation_id": conversation_id,
#         "messages": conversation
#     }

# # -----------------------
# # Monitoring / Health API
# # -----------------------

# @app.get("/health")
# def health():
#     return {"status": "ok"}


# @app.get("/health/redis")
# def health_redis():
#     try:
#         memory.client.ping()
#         return {"redis": "connected"}
#     except Exception:
#         raise HTTPException(status_code=500, detail="Redis not reachable")


# @app.get("/health/llm")
# def health_llm():
#     try:
#         # Minimal LLM ping
#         from langchain_groq import ChatGroq
#         from app.config import GROQ_MODEL
#         llm = ChatGroq(model=GROQ_MODEL)
#         llm.invoke("Hi")
#         return {"llm": "reachable"}
#     except Exception:
#         raise HTTPException(status_code=500, detail="LLM not reachable")

# # -----------------------
# # Resume Upload API
# # -----------------------

# @app.post("/api/upload-resume")
# async def upload_resume(
#     resume: UploadFile = File(...),
#     session_id: str = Form(...)
# ):
#     try:
#         # 1. Read the file bytes into memory
#         content = await resume.read()
        
       
#         # 2. Extract text from the PDF
#         extracted_text = ""
#         if resume.filename.lower().endswith(".pdf"):
#             pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
#             for page in pdf_reader.pages:
#                  resume_context = SystemMessage(content=f"IMPORTANT BACKGROUND: The user has provided their resume. Please base your interview questions on this profile:\n\n{extracted_text}")
#         else:
#             # Basic fallback for text files (you can add python-docx for Word docs later)
#             extracted_text = content.decode('utf-8', errors='ignore')

#         # 3. Retrieve any existing memory for this session (usually empty at this stage)
#         conversation = memory.get_conversation(session_id)
#         if not conversation:
#             conversation = []

#         # 4. Inject the resume as a hidden "system" or "user" context message
#         resume_context = {
#             "role": "system", # Note: change this to "user" if your LangChain prompt template strictly requires user/ai alternating roles
#             "content": f"IMPORTANT BACKGROUND: The user has provided their resume. Please base your interview questions on this profile:\n\n{extracted_text}"
#         }
        
#         # Append to the beginning of the conversation history
#         conversation.append(resume_context)
        
#         # 5. Save it back to Redis/MemoryStore
#         memory.save_conversation(session_id, conversation)

#         return {"status": "success", "filename": resume.filename, "message": "Resume context injected into memory."}

#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")




# backend/app/main.py

import io
import PyPDF2
from fastapi import FastAPI, WebSocket, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import SystemMessage

from app.websocket import websocket_handler
from app.config import APP_NAME, APP_VERSION
from app.memory.store import MemoryStore

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development, allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

memory = MemoryStore()


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket_handler(websocket)


# -----------------------
# Admin API (Read-only)
# -----------------------

@app.get("/admin/conversations")
def list_conversations():
    """
    Returns all known conversation IDs.
    """
    return {
        "conversations": memory.list_conversations()
    }


@app.get("/admin/conversations/{conversation_id}")
def get_conversation(conversation_id: str):
    """
    Returns the conversation history for a given ID.
    """
    conversation = memory.get_conversation(conversation_id)

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {
        "conversation_id": conversation_id,
        "messages": conversation
    }

# -----------------------
# Monitoring / Health API
# -----------------------

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/health/redis")
def health_redis():
    try:
        memory.client.ping()
        return {"redis": "connected"}
    except Exception:
        raise HTTPException(status_code=500, detail="Redis not reachable")


@app.get("/health/llm")
def health_llm():
    try:
        # Minimal LLM ping
        from langchain_groq import ChatGroq
        from app.config import GROQ_MODEL
        llm = ChatGroq(model=GROQ_MODEL)
        llm.invoke("Hi")
        return {"llm": "reachable"}
    except Exception:
        raise HTTPException(status_code=500, detail="LLM not reachable")

# -----------------------
# Resume Upload API
# -----------------------

@app.post("/api/upload-resume")
async def upload_resume(
    resume: UploadFile = File(...),
    session_id: str = Form(...)
):
    try:
        # 1. Read the file bytes into memory
        content = await resume.read()
        
        # 2. Extract text from the PDF
        extracted_text = ""
        if resume.filename.lower().endswith(".pdf"):
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in pdf_reader.pages:
                # FIX: Actually extract the text from each page
                extracted_text += page.extract_text() + "\n"
        else:
            # Basic fallback for text files
            extracted_text = content.decode('utf-8', errors='ignore')

        # 3. Retrieve any existing memory for this session
        conversation = memory.get_conversation(session_id)
        if not conversation:
            conversation = []

        # 4. Inject the resume as a LangChain SystemMessage
        resume_context = SystemMessage(
            content=f"IMPORTANT BACKGROUND: The user has provided their resume. Please base your interview questions on this profile:\n\n{extracted_text}"
        )
        
        # Append to the beginning of the conversation history
        conversation.append(resume_context)
        
        # 5. Save it back to Redis/MemoryStore
        memory.save_conversation(session_id, conversation)

        return {"status": "success", "filename": resume.filename, "message": "Resume context injected into memory."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process resume: {str(e)}")