"""
Centralized logging configuration for the AudioBot backend.

Usage:
    from app.core.logging import setup_logging
    setup_logging()  # Call once at app startup

In development: human-readable colored output.
In production:  JSON-structured logs for log aggregation tools.
"""

import logging
import json
import sys
from datetime import datetime, timezone

from app.config import ENVIRONMENT


class JSONFormatter(logging.Formatter):
    """Outputs log records as single-line JSON objects for production log aggregation."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "request_id"):
            log_entry["request_id"] = record.request_id
        return json.dumps(log_entry, default=str)


class DevFormatter(logging.Formatter):
    """Human-readable log format for development with timestamps and level."""

    LEVEL_COLORS = {
        "DEBUG": "\033[36m",     # Cyan
        "INFO": "\033[32m",      # Green
        "WARNING": "\033[33m",   # Yellow
        "ERROR": "\033[31m",     # Red
        "CRITICAL": "\033[41m",  # Red background
    }
    RESET = "\033[0m"

    def format(self, record: logging.LogRecord) -> str:
        color = self.LEVEL_COLORS.get(record.levelname, "")
        reset = self.RESET
        timestamp = datetime.now().strftime("%H:%M:%S")
        return f"{color}{timestamp} [{record.levelname:>8}]{reset} {record.name}: {record.getMessage()}"


def setup_logging(level: int = logging.INFO) -> None:
    """
    Configure the root logger for the entire application.

    Call this ONCE at startup (in the FastAPI lifespan handler).
    Uses JSON formatting in production, colored dev formatting otherwise.
    """
    root_logger = logging.getLogger()

    # Clear any existing handlers to avoid duplicate logs
    root_logger.handlers.clear()

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)

    if ENVIRONMENT in {"production", "staging"}:
        handler.setFormatter(JSONFormatter())
    else:
        handler.setFormatter(DevFormatter())

    root_logger.setLevel(level)
    root_logger.addHandler(handler)

    # Quiet down noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
