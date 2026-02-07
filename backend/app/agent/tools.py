# backend/app/agent/tools.py

from datetime import datetime


def get_current_time() -> str:
    """
    Returns the current time in a human-readable format.
    """
    now = datetime.now()
    return now.strftime("%Y-%m-%d %H:%M:%S")
