import { useRef, useState, useCallback } from 'react';

const useAudioBot = (sessionId) => {
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isBotSpeaking, setIsBotSpeaking] = useState(false);
  const [botResponse, setBotResponse] = useState('');
  
  // Added this to capture the STT transcription your backend sends back
  const [transcription, setTranscription] = useState(''); 

  const connect = useCallback((currentSessionId) => {
    // Fallback to a default if ID is missing so the connection doesn't fail
    const idToUse = currentSessionId || sessionId || "default-session";
    
    // Connect directly to your FastAPI backend
    const ws = new WebSocket("ws://127.0.0.1:8000/ws");
    ws.binaryType = "arraybuffer"; // Required to receive the audio_bytes from FastAPI
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connected");
      setIsConnected(true);
    };

    ws.onclose = () => {
      console.log("⚠️ WebSocket closed");
      setIsConnected(false);
      setIsRecording(false);
    };

    ws.onerror = (err) => {
      console.error("❌ WebSocket error", err);
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      // 1. Handle incoming audio bytes (from tts.synthesize in backend)
      if (event.data instanceof ArrayBuffer) {
        console.log("🔊 Received audio response from backend");
        const blob = new Blob([event.data], { type: "audio/wav" });
        const audio = new Audio(URL.createObjectURL(blob));
        setIsBotSpeaking(true);
        audio.play();
        audio.onended = () => setIsBotSpeaking(false);
        return;
      }

      // 2. Handle incoming JSON text
      try {
        const data = JSON.parse(event.data);
        if (data.error) {
          console.error("Backend Error:", data.error);
          return;
        }

        // Match the message types sent by websocket.py
        if (data.type === "transcription") {
          setTranscription({ sender: data.sender, text: data.text, id: Date.now() });
        } else if (data.type === "response") {
          setBotResponse({ sender: data.sender, text: data.text, id: Date.now() });
        }
      } catch (e) {
        console.warn("Received non-JSON text from WebSocket", event.data);
      }
    };
  }, [sessionId]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    mediaRecorderRef.current?.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (!isConnected) return;
    try {
      audioChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) return;

        const blob = new Blob(audioChunksRef.current, { type: "audio/wav" });
        const buffer = await blob.arrayBuffer();

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const currentSessionId = sessionId || "default-session";
          
          // STEP 1: Send the control message exactly as websocket.py expects
          wsRef.current.send(JSON.stringify({
            type: "audio",
            conversation_id: currentSessionId
          }));

          // STEP 2: Immediately send the binary audio bytes
          wsRef.current.send(buffer);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone error:', err);
      alert("Please allow microphone access");
    }
  }, [isConnected, sessionId]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
    setIsRecording(false);
  }, []);

  // Added this just in case you want to type text to your bot later!
  const sendTextMessage = useCallback((text) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
          const currentSessionId = sessionId || "default-session";
          wsRef.current.send(JSON.stringify({
              type: "text",
              conversation_id: currentSessionId,
              message: text
          }));
      }
  }, [sessionId]);

  return {
    isConnected, isRecording, isBotSpeaking, botResponse, transcription,
    connect, disconnect, startRecording, stopRecording, sendTextMessage
  };
};

export default useAudioBot;