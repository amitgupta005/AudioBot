import asyncio
import os
import sys

# Add parent directory to path to import app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.audio.tts import TextToSpeech

async def test_tts():
    print("Testing edge-tts synthesis...")
    tts = TextToSpeech()
    text = "Hello! This is a test of the new edge-tts system for AudioBot. It should be much faster than before."
    
    audio_data = await tts.synthesize(text)
    
    if audio_data and len(audio_data) > 0:
        print(f"Success! Generated {len(audio_data)} bytes of audio.")
        # Save to temp file for manual check if needed
        with open("tts_test_output.mp3", "wb") as f:
            f.write(audio_data)
        print("Audio saved to tts_test_output.mp3")
    else:
        print("Failed to generate audio.")

if __name__ == "__main__":
    asyncio.run(test_tts())
