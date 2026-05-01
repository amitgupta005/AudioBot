# =============================================================================
# AudioBot Backend — Production Dockerfile
# =============================================================================
# Multi-layer optimized build:
#   1. Install dependencies first (cached unless requirements.lock changes)
#   2. Copy application code (rebuilds on every code change)
#   3. Run as non-root user for security
# =============================================================================

FROM python:3.11-slim AS base

# ---- Metadata ----
LABEL maintainer="AudioBot Team"
LABEL description="AudioBot Backend — FastAPI + LangGraph Interview AI"
LABEL version="0.2.0"

# ---- System dependencies ----
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# ---- Create non-root user ----
RUN groupadd --gid 1000 appuser && \
    useradd --uid 1000 --gid appuser --create-home appuser

WORKDIR /app

# ---- Install Python dependencies (cached layer) ----
COPY requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r requirements.lock

# ---- Copy application code ----
COPY pyproject.toml /app/
COPY alembic.ini /app/
COPY migrations /app/migrations
COPY app /app/app

# ---- Install the app package (for proper imports) ----
RUN pip install --no-cache-dir --no-deps -e .

# ---- Adjust permissions ----
RUN chown -R appuser:appuser /app

# ---- Switch to non-root user ----
USER appuser

EXPOSE 8000

# ---- Health check ----
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-8000}/docs || exit 1

# ---- Entrypoint ----
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
