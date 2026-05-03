"""
AudioBot Backend — Application Factory

This is the main FastAPI application entry point. It:
1. Defines the application lifespan (startup/shutdown)
2. Configures middleware (CORS, rate limiting)
3. Includes all API routers with OpenAPI tags
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import (
    APP_NAME,
    APP_VERSION,
    CORS_ALLOW_CREDENTIALS,
    CORS_ALLOW_ORIGINS,
)
from app.core.logging import setup_logging

logger = logging.getLogger(__name__)


# =====================================
# Lifespan — startup / shutdown
# =====================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.

    Startup:  Build the LangGraph agent, load STT/TTS models.
    Shutdown: (reserved for future cleanup — closing Redis, DB pools, etc.)
    """
    # --- Startup ---
    setup_logging()
    logger.info("Starting AudioBot backend…")

    # Initialize Postgres Checkpointer pool and tables
    from app.agent.graph import pool
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from app.dependencies import agent

    await pool.open()
    postgres_saver = AsyncPostgresSaver(pool)
    await postgres_saver.setup()
    agent.checkpointer = postgres_saver
    logger.info("Postgres checkpointer initialized.")
    # Force the dependencies module to initialize agent, stt, tts.
    # They're singletons stored at module level in dependencies.py.
    from app.dependencies import agent, stt, tts  # noqa: F401
    logger.info("All components (Agent, STT, TTS) initialized.")

    yield  # Application runs here

    # --- Shutdown ---
    logger.info("Shutting down AudioBot backend…")
    from app.agent.graph import pool
    await pool.close()


# =====================================
# OpenAPI Tags
# =====================================

tags_metadata = [
    {"name": "auth", "description": "Authentication — register, login, token management"},
    {"name": "jobs", "description": "Job postings — create, list, update"},
    {"name": "candidates", "description": "Candidate applications — apply, list, update"},
    {"name": "interviews", "description": "Interview sessions — CRUD, WebSocket streaming, reports"},
    {"name": "conversations", "description": "Conversation history retrieval"},
    {"name": "recruiter", "description": "Recruiter-specific views — jobs, candidates, conversations"},
    {"name": "admin", "description": "Admin-only — conversations, health checks"},
]


# =====================================
# Application Instance
# =====================================

app = FastAPI(
    title=APP_NAME,
    version=APP_VERSION,
    lifespan=lifespan,
    openapi_tags=tags_metadata,
)


# =====================================
# Rate Limiting
# =====================================

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {exc.detail}"},
    )


# =====================================
# CORS Middleware
# =====================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOW_ORIGINS,
    allow_credentials=CORS_ALLOW_CREDENTIALS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =====================================
# Register Routers
# =====================================

from app.routers import auth, jobs, candidates, interviews, mock_interviews, admin, recruiter, conversations  # noqa: E402

# Apply rate limits to auth routes (must be done at the app level, not router level)
limiter.limit("10/minute")(auth.register)
limiter.limit("5/minute")(auth.login)
limiter.limit("3/minute")(admin.health_llm)

app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(interviews.router)
app.include_router(mock_interviews.router)
app.include_router(conversations.router)
app.include_router(recruiter.router)
app.include_router(admin.router)
