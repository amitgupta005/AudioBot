# AudioBot 🤖

**AudioBot** is a premium, full-stack conversational AI application that offers a seamless voice-first experience. Featuring high-performance LLMs, real-time speech processing, and a stunning glassmorphic interface, it transforms simple chat into an immersive AI interaction.

## 🚀 Features

- **Real-time Voice Interaction**: High-fidelity recording and playback for natural conversations.
- **Premium UI/UX**: Modern glassmorphic design with dark mode, smooth animations, and a tabbed interface.
- **Advanced LLM**: Powered by **Groq (Qwen 32B)** for lighting-fast, intelligent responses.
- **Speech-to-Text (STT)**: Robust transcription using **faster-whisper**.
- **Text-to-Speech (TTS)**: Life-like voice output via **Coqui TTS** with automated text cleaning (markdown/emoji filtering).
- **Persistent Memory**: Conversation history stored in **Redis**, allowing for context-aware multi-turn dialogues.
- **Configurable Persona**: Define the AI's personality via custom system prompts and greeting messages.

## 🛠️ Tech Stack

### Frontend
- **Vanilla JavaScript (ES6+)**: Custom state management, tab logic, and WebSocket handling.
- **CSS3 Variables**: Customizable theme tokens and responsive layouts.
- **Glassmorphism**: Backdrop-filter effects for a premium look.

### Backend
- **Python 3.13+**: Core application logic.
- **FastAPI**: Asynchronous web framework.
- **LangGraph**: State-based agent orchestration.
- **Redis**: Fast, persistent storage for chat sessions.

### AI Engine
- **Groq**: High-speed LLM processing (Qwen model).
- **faster-whisper**: Optimized speech-to-text.
- **Coqui TTS**: Advanced neural text-to-speech.

## 📂 Project Structure

```
AudioBot/
├── backend/            # FastAPI backend application
│   ├── app/
│   │   ├── agent/      # LangGraph logic (nodes, state, graph)
│   │   ├── audio/      # STT and TTS engines
│   │   ├── memory/     # Redis-backed session store
│   │   ├── main.py     # API Entry point
│   │   └── config.py   # Centralized configuration
│   └── requirements.txt
├── frontend/           # Modern web interface
│   ├── index.html      # Glassmorphic layout
│   ├── app.js          # Client-side logic & UX
│   └── styles.css      # Premium styling
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- **Python 3.13+**
- **Redis Server**: Running locally or via Docker.
- **Groq API Key**: Required for the LLM.

### Installation

1.  **Clone the repository**
2.  **Install dependencies**:
    ```bash
    cd backend
    pip install -r requirements.txt
    ```
3.  **Configure Environment**:
    Create a `.env` file in `backend/app/`:
    ```env
    GROQ_API_KEY=your_key_here
    SYSTEM_PROMPT="You are a professional HR interviewer..."
    ```

### Running the Application

1.  **Start the Backend**:
    ```bash
    cd backend
    python -m uvicorn app.main:app --reload
    ```

2.  **Access the Frontend**:
    Open `frontend/index.html` in your browser (or serve via `python -m http.server`).

## 🔄 Interaction Flow

1.  **Mic Capture**: AudioBot records your voice and streams bytes via WebSocket.
2.  **STT**: Whisper transcribes speech to text instantly.
3.  **Agent Processing**: LangGraph classifies intent and fetches memory from Redis.
4.  **LLM Generation**: Groq generates a context-aware response using the system prompt.
5.  **Clean & Speak**: TTS cleans markdown/emojis and synthesizes a voice response.

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.
