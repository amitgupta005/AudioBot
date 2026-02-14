from dotenv import load_dotenv
import os

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

# LLM configuration
GROQ_MODEL = "qwen/qwen3-32b"

# Audio configuration
STT_MODEL = "base"
TTS_MODEL = "tts_models/en/ljspeech/tacotron2-DDC"

# Redis configuration
REDIS_HOST = "localhost"
REDIS_PORT = 6379
REDIS_DB = 0

# Application settings
APP_NAME = "AudioBot - Conversational AI"
APP_VERSION = "0.2.0"