# backend/cli_audio.py

import sys
import os
import time
import io
import wave
import numpy as np
import sounddevice as sd
import soundfile as sf
import logging
import threading

# Ensure backend module is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.agent.graph import build_agent
from app.agent.state import AgentState
from app.memory.store import MemoryStore
from app.audio.stt import SpeechToText
from app.audio.tts import TextToSpeech

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AudioRecorder:
    def __init__(self, fs=16000):
        self.fs = fs
        self.recording = []
        self.is_recording = False
        self.stream = None

    def _callback(self, indata, frames, time, status):
        if status:
            print(status, file=sys.stderr)
        if self.is_recording:
            self.recording.append(indata.copy())

    def start(self):
        self.recording = []
        self.is_recording = True
        self.stream = sd.InputStream(samplerate=self.fs, channels=1, callback=self._callback)
        self.stream.start()

    def stop(self):
        self.is_recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
        
        if not self.recording:
            return None
        
        audio_data = np.concatenate(self.recording, axis=0)
        # Convert to wav bytes
        buffer = io.BytesIO()
        sf.write(buffer, audio_data, self.fs, format='wav')
        return buffer.getvalue()

def play_audio(audio_bytes):
    """
    Plays wav bytes through the speakers.
    """
    print("Playing response...")
    data, fs = sf.read(io.BytesIO(audio_bytes))
    sd.play(data, fs)
    sd.wait()

def main():
    print("Initializing AudioBot Voice Agent...")
    try:
        agent = build_agent()
        memory = MemoryStore()
        stt = SpeechToText()
        tts = TextToSpeech()
        recorder = AudioRecorder()
        logger.info("All components initialized.")
    except Exception as e:
        logger.error(f"Initialization failed: {e}")
        return

    # Use a default ID for CLI sessions
    conversation_id = "cli-audio-session"
    
    # Load existing history from Redis
    conversation = memory.get_conversation(conversation_id)

    print(f"\n--- AudioBot Voice CLI (Session: {conversation_id}) ---")
    print("Controls:")
    print(" - Press Enter to START recording")
    print(" - Press Enter again to STOP recording")
    print(" - Press Ctrl+C to EXIT\n")

    while True:
        try:
            input(">> Press Enter to START recording...")
            recorder.start()
            
            input(">> Recording... Press Enter to STOP.")
            audio_in = recorder.stop()
            
            if audio_in is None:
                print("No audio captured.")
                continue

            # 2. STT: Speech -> Text
            print("Transcribing...")
            user_text = stt.transcribe(audio_in)
            print(f"You: {user_text}")
            
            if not user_text.strip() or user_text == "...":
                print("No speech detected, try again.")
                continue

            # 3. Agent: Process Text
            state = AgentState(
                user_input=user_text,
                conversation=conversation,
                output="",
                intent=None
            )
            result = agent.invoke(state)
            conversation = result["conversation"]
            memory.save_conversation(conversation_id, conversation)
            print(f"Bot: {result['output']}")

            # 4. TTS: Text -> Speech
            print("Synthesizing...")
            audio_out = tts.synthesize(result["output"])
            
            # 5. Playback
            play_audio(audio_out)
            
        except KeyboardInterrupt:
            print("\nGoodbye!")
            break
        except Exception as e:
            logger.error(f"Error in main loop: {e}")
            time.sleep(1)

if __name__ == "__main__":
    main()
