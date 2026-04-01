# backend/app/config.py

from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# LLM configuration
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")


# ============================================================
# SYSTEM MESSAGE TEMPLATE
# ============================================================
SYSTEM_MESSAGE = """
You are an HR interviewer assessing cultural fit.
You are provided with:
1. A Job Description
2. A Candidate's Resume
Use both to tailor your interview questions.
==============================
JOB DESCRIPTION
==============================
{jd_text}
==============================
CANDIDATE RESUME
==============================
{resume_text}
==============================
INSTRUCTIONS
==============================
1. Begin by understanding the candidate's background:
   - Personal overview
   - Family background
   - Educational journey
2. Ask ONLY one question at a time.
3. After gathering initial context, ask relevant follow-up questions based on the candidate's responses to assess:
   - Personality
   - Values
   - Teamwork
   - Communication style
   - Adaptability
   - Accountability
   - Conflict handling
4. Use behavioral and situational questions when appropriate.
5. If answers are vague or incomplete, ask clarifying follow-up questions.
6. Maintain a professional and neutral tone.
7. Do NOT provide feedback, evaluation, or judgment during the interview.
"""

# Audio configuration
STT_MODEL = "base"
TTS_MODEL = "en-US-AvaNeural"

# Report output configuration
REPORTS_DIR = os.getenv(
    "REPORTS_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "generated_reports")),
)

# Redis configuration (env-driven)
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_DB = int(os.getenv("REDIS_DB", "0"))
REDIS_URL = os.getenv("REDIS_URL", f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}")

# Application settings
APP_NAME = "AudioBot - Conversational AI"
APP_VERSION = "0.2.0"

# ============================================================
# CLOUDINARY CONFIGURATION (for PDF uploads)
# ============================================================
CLOUDINARY_CLOUD_NAME = os.getenv("CLOUDINARY_CLOUD_NAME")
CLOUDINARY_API_KEY = os.getenv("CLOUDINARY_API_KEY")
CLOUDINARY_API_SECRET = os.getenv("CLOUDINARY_API_SECRET")

# ============================================================
# MONGODB CONFIGURATION
# ============================================================
MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:2000")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "test")

# ============================================================
# GATEWAY API CONFIGURATION
# ============================================================
GATEWAY_API_URL = os.getenv("GATEWAY_API_URL", "http://localhost:4001/api")
