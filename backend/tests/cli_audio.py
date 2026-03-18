# backend/tests/cli_audio.py

import asyncio
import io
import logging
import os
import sys
import tempfile
import time

import numpy as np
import sounddevice as sd
import soundfile as sf

# Ensure backend module is in path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.dependencies import agent, stt, tts
from app.config import SYSTEM_MESSAGE

logging.basicConfig(level=logging.ERROR) # Minimize logs for CLI
logger = logging.getLogger(__name__)


class AudioRecorder:
    def __init__(self, fs: int = 16000):
        self.fs = fs
        self.recording = []
        self.is_recording = False
        self.stream = None

    def _callback(self, indata, frames, callback_time, status):
        if status:
            print(status, file=sys.stderr)
        if self.is_recording:
            self.recording.append(indata.copy())

    def start(self) -> None:
        self.recording = []
        self.is_recording = True
        self.stream = sd.InputStream(
            samplerate=self.fs,
            channels=1,
            callback=self._callback,
        )
        self.stream.start()

    def stop(self) -> bytes | None:
        self.is_recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

        if not self.recording:
            return None

        audio_data = np.concatenate(self.recording, axis=0)
        buffer = io.BytesIO()
        sf.write(buffer, audio_data, self.fs, format="wav")
        return buffer.getvalue()


def play_audio(audio_bytes: bytes) -> None:
    if not audio_bytes:
        print("No audio returned from TTS.")
        return

    try:
        data, fs = sf.read(io.BytesIO(audio_bytes))
        print("Playing response...")
        sd.play(data, fs)
        sd.wait()
        return
    except Exception as e:
        logger.debug(f"Playback error: {e}")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_file.write(audio_bytes)
        temp_path = temp_file.name
    print(f"Audio response saved to {temp_path}")


async def main_async() -> None:
    print("--- AudioBot Voice CLI (Session: cli-audio-session) ---")
    
    conversation_id = os.getenv("AUDIOBOT_AUDIO_SESSION_ID", "cli-audio-session")
    config = {"configurable": {"thread_id": conversation_id}}

    print("Controls:")
    print(" - Press Enter once to start recording")
    print(" - Press Enter again to stop recording")
    print(" - Press Ctrl+C to exit\n")

    recorder = AudioRecorder()

    while True:
        try:
            input(">> Press Enter to start recording...")
            recorder.start()

            input(">> Recording... Press Enter to stop.")
            audio_in = recorder.stop()
            if audio_in is None:
                print("No audio captured.")
                continue

            print("Transcribing...")
            user_text = stt.transcribe(audio_in)
            if not user_text.strip() or user_text == "...":
                print("No speech detected, try again.")
                continue
            print(f"You: {user_text}")

            print("Bot thinking...")
            # Use LangGraph Agent directly
            result = agent.invoke(
                {
                    "user_input": user_text,
                    "system_message": SYSTEM_MESSAGE,
                },
                config=config,
            )
            print(f"Bot: {result['output']}")

            print("Synthesizing...")
            audio_out = await tts.synthesize(result["output"])
            play_audio(audio_out)

        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as exc:
            logger.error("Error in main loop: %s", exc)
            time.sleep(1)


if __name__ == "__main__":
    try:
        asyncio.run(main_async())
    except KeyboardInterrupt:
        pass
