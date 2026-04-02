import argparse
import asyncio
import io
import logging
import uuid

import sounddevice as sd
import soundfile as sf

from app.config import SYSTEM_MESSAGE
from app.dependencies import agent, stt, tts


logger = logging.getLogger("cli_audio")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Talk to the backend agent through your microphone.")
    parser.add_argument(
        "--session-id",
        default=f"cli-audio-{uuid.uuid4().hex[:8]}",
        help="Conversation thread ID to use for the LangGraph checkpointer.",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=6.0,
        help="Recording duration in seconds for each turn.",
    )
    parser.add_argument(
        "--samplerate",
        type=int,
        default=16000,
        help="Microphone sample rate used for recording WAV audio.",
    )
    return parser


def record_wav_bytes(duration: float, samplerate: int) -> bytes:
    frames = int(duration * samplerate)
    logger.info("Recording %.1f seconds of audio...", duration)
    audio = sd.rec(frames, samplerate=samplerate, channels=1, dtype="float32")
    sd.wait()

    buffer = io.BytesIO()
    sf.write(buffer, audio, samplerate, format="WAV")
    return buffer.getvalue()


def play_audio_bytes(audio_bytes: bytes) -> None:
    if not audio_bytes:
        logger.warning("No audio returned from TTS.")
        return

    data, samplerate = sf.read(io.BytesIO(audio_bytes), dtype="float32")
    logger.info("Playing synthesized audio...")
    sd.play(data, samplerate)
    sd.wait()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args = build_parser().parse_args()
    config = {"configurable": {"thread_id": args.session_id}}

    print(f"Session: {args.session_id}")
    print("Press Enter to record a turn. Type 'exit' or 'quit' to stop.\n")

    while True:
        try:
            command = input("Command: ").strip().lower()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if command in {"exit", "quit"}:
            print("Exiting.")
            break

        try:
            wav_bytes = record_wav_bytes(args.duration, args.samplerate)
            user_text = stt.transcribe(wav_bytes)
        except Exception as exc:
            print(f"Audio input error: {exc}")
            continue

        if not user_text:
            print("No speech detected.\n")
            continue

        print(f"You: {user_text}")

        try:
            result = agent.invoke(
                {
                    "user_input": user_text,
                    "system_message": SYSTEM_MESSAGE,
                },
                config=config,
            )
        except Exception as exc:
            print(f"Agent error: {exc}")
            continue

        response_text = result.get("output", "I'm sorry, I couldn't process that.")
        print(f"AI: {response_text}\n")

        try:
            audio_response = asyncio.run(tts.synthesize(response_text))
            play_audio_bytes(audio_response)
        except Exception as exc:
            print(f"Audio output error: {exc}")

        if result.get("interview_complete"):
            report_download_url = result.get("report_download_url")
            if report_download_url:
                print(f"Report: {report_download_url}")
            break


if __name__ == "__main__":
    main()
