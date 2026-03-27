import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import {
  buildConversationReportUrl,
  createChatSocket,
  fetchConversation,
  fetchConversationIds,
  resolveApiUrl,
} from "../lib/api";
import {
  listKnownSessions,
  startNewSession,
  touchSession,
} from "../lib/sessionStore";

function dedupeSessions(localSessions, remoteIds, currentSessionId) {
  const map = new Map();

  localSessions.forEach((session) => {
    map.set(session.id, session);
  });

  remoteIds.forEach((id) => {
    if (!map.has(id)) {
      map.set(id, { id });
    }
  });

  if (currentSessionId && !map.has(currentSessionId)) {
    map.set(currentSessionId, { id: currentSessionId });
  }

  return Array.from(map.values());
}

export default function ChatPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const socketRef = useRef(null);
  const recorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const chatStreamRef = useRef(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [systemMessage, setSystemMessage] = useState("");
  const [systemExpanded, setSystemExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [socketState, setSocketState] = useState("connecting");
  const [interviewComplete, setInterviewComplete] = useState(false);
  const [completionReason, setCompletionReason] = useState("");
  const [reportStatus, setReportStatus] = useState("");
  const [candidateSummary, setCandidateSummary] = useState("");
  const [candidateScores, setCandidateScores] = useState(null);
  const [reportDownloadUrl, setReportDownloadUrl] = useState("");

  useEffect(() => {
    touchSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    let active = true;

    async function loadSidebarData() {
      setLoading(true);
      setError("");

      try {
        const [conversation, conversationIds] = await Promise.all([
          fetchConversation(sessionId),
          fetchConversationIds().catch(() => []),
        ]);

        if (!active) {
          return;
        }

        const transcript = (conversation.messages || []).map((message) => ({
          type: message.type,
          content: message.data?.content || "",
        }));

        setMessages(transcript);
        setSystemMessage(conversation.system_message?.resolved || "");
        setInterviewComplete(Boolean(conversation.interview_complete));
        setCompletionReason(conversation.completion_reason || "");
        setReportStatus(conversation.report_status || "");
        setCandidateSummary(conversation.candidate_summary || "");
        setCandidateScores(conversation.candidate_scores || null);
        setReportDownloadUrl(resolveApiUrl(conversation.report_download_url || ""));
        setSessions(dedupeSessions(listKnownSessions(), conversationIds, sessionId));
      } catch (loadError) {
        if (!active) {
          return;
        }

        setMessages([]);
        setSessions(dedupeSessions(listKnownSessions(), [], sessionId));
        setSystemMessage("");
        setInterviewComplete(false);
        setCompletionReason("");
        setReportStatus("");
        setCandidateSummary("");
        setCandidateScores(null);
        setReportDownloadUrl("");
        setError(loadError.message || "Could not load this session yet. Upload documents first.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSidebarData();
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const socket = createChatSocket();
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setSocketState("open");
    });

    socket.addEventListener("close", () => {
      setSocketState("closed");
    });

    socket.addEventListener("error", () => {
      setSocketState("error");
      setError("WebSocket connection failed.");
    });

    socket.addEventListener("message", async (event) => {
      try {
        if (typeof event.data !== "string") {
          try {
            const audioUrl = URL.createObjectURL(event.data);
            const audio = new Audio(audioUrl);
            audio.addEventListener("ended", () => URL.revokeObjectURL(audioUrl), { once: true });
            await audio.play();
          } catch {
            // Binary audio is optional for the UI; keep chat functional even if playback fails.
          }
          return;
        }

        const payload = JSON.parse(event.data);
        if (payload.error) {
          setError(payload.error);
          setSending(false);
          setRecording(false);
          if (payload.interview_complete) {
            setInterviewComplete(true);
            setCompletionReason(payload.completion_reason || "");
            setReportStatus(payload.report_status || "");
            setReportDownloadUrl(resolveApiUrl(payload.report_download_url) || buildConversationReportUrl(sessionId));
          }
          return;
        }

        if (payload.type === "transcription") {
          setMessages((current) => [...current, { type: "human", content: payload.text }]);
          return;
        }

        if (payload.type === "response") {
          setMessages((current) => [...current, { type: "ai", content: payload.text }]);
          setSending(false);
          setRecording(false);
          setInterviewComplete(Boolean(payload.interview_complete));
          setCompletionReason(payload.completion_reason || "");
          setReportStatus(payload.report_status || "");
          setReportDownloadUrl(resolveApiUrl(payload.report_download_url || ""));

          try {
            const conversation = await fetchConversation(sessionId);
            const transcript = (conversation.messages || []).map((message) => ({
              type: message.type,
              content: message.data?.content || "",
            }));
            setMessages(transcript);
            setSystemMessage(conversation.system_message?.resolved || "");
            setInterviewComplete(Boolean(conversation.interview_complete));
            setCompletionReason(conversation.completion_reason || "");
            setReportStatus(conversation.report_status || "");
            setCandidateSummary(conversation.candidate_summary || "");
            setCandidateScores(conversation.candidate_scores || null);
            setReportDownloadUrl(resolveApiUrl(conversation.report_download_url || ""));
          } catch {
            // Keep optimistic state if admin fetch is temporarily unavailable.
          }
        }
      } catch {
        setError("Unexpected message received from the backend.");
        setSending(false);
        setRecording(false);
      }
    });

    return () => {
      socket.close();
    };
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    function handleKeydown(event) {
      if (event.key !== "Enter" || event.shiftKey) {
        return;
      }

      const activeTag = document.activeElement?.tagName;
      const isTyping = activeTag === "TEXTAREA" || activeTag === "INPUT";

      if (recording) {
        event.preventDefault();
        handleVoiceToggle();
        return;
      }

      if (isTyping && input.trim() && !interviewComplete) {
        event.preventDefault();
        handleSend(event);
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [input, interviewComplete, recording, socketState, sending, sessionId]);

  function handleSend(event) {
    event?.preventDefault?.();
    const trimmed = input.trim();

    if (
      !trimmed ||
      sending ||
      recording ||
      interviewComplete ||
      !socketRef.current ||
      socketRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    setError("");
    setSending(true);
    setMessages((current) => [...current, { type: "human", content: trimmed }]);
    setInput("");
    socketRef.current.send(
      JSON.stringify({
        type: "text",
        conversation_id: sessionId,
        message: trimmed,
      }),
    );
  }

  function handleNewSession() {
    startNewSession();
    navigate("/");
  }

  async function handleVoiceToggle() {
    if (interviewComplete) {
      return;
    }

    if (recording) {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      return;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setError("WebSocket is not ready for audio streaming.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Audio recording is not supported in this browser.");
      return;
    }

    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
          audioChunksRef.current = [];
          setSending(true);
          setRecording(false);
          socketRef.current.send(JSON.stringify({ type: "audio", conversation_id: sessionId }));
          socketRef.current.send(audioBlob);
        } catch {
          setError("Audio capture failed.");
          setSending(false);
          setRecording(false);
        } finally {
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
        }
      });

      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone permission was denied.");
    }
  }

  function handleSelectSession(nextSessionId) {
    touchSession(nextSessionId);
    navigate(`/chat/${nextSessionId}`);
  }

  useEffect(() => {
    if (!chatStreamRef.current) {
      return;
    }

    if (typeof chatStreamRef.current.scrollTo === "function") {
      chatStreamRef.current.scrollTo({
        top: chatStreamRef.current.scrollHeight,
        behavior: "smooth",
      });
      return;
    }

    chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight;
  }, [messages]);

  return (
    <main className="chat-layout">
      <Sidebar
        currentSessionId={sessionId}
        onNewSession={handleNewSession}
        onSelectSession={handleSelectSession}
        onToggleSystem={() => setSystemExpanded((value) => !value)}
        sessions={sessions}
        socketState={socketState}
        systemExpanded={systemExpanded}
        systemMessage={systemMessage}
      />

      <section className="chat-stage">
        <header className="chat-header">
          <div>
            <p className="eyebrow">Interview Console</p>
            <h1>Context-aware HR interview chat</h1>
          </div>
          <span className={`socket-pill ${socketState}`}>{socketState}</span>
        </header>

        <div className="chat-stream" data-testid="chat-stream" ref={chatStreamRef}>
          {loading ? <p className="empty-copy">Loading session state...</p> : null}
          {!loading && messages.length === 0 ? (
            <p className="empty-copy">
              Start with an introduction. The backend will use the uploaded JD and resume to steer
              the interview.
            </p>
          ) : null}
          {messages.map((message, index) => (
            <article key={`${message.type}-${index}`} className={`bubble ${message.type}`}>
              <span>{message.type === "human" ? "You" : "AudioBot"}</span>
              <p>{message.content}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={handleSend}>
          <textarea
            disabled={interviewComplete}
            onChange={(event) => setInput(event.target.value)}
            placeholder={interviewComplete ? "Interview complete. Start a new session to continue." : "Type your answer or ask for clarification..."}
            readOnly={interviewComplete}
            rows={4}
            value={input}
          />
          <div className="composer-footer">
            <p className="hint-copy">
              Session history is persisted by the backend under thread id <code>{sessionId}</code>.
            </p>
            <div className="composer-actions">
              <button
                className={`secondary-button ${recording ? "recording" : ""}`}
                disabled={sending || socketState !== "open" || interviewComplete}
                onClick={handleVoiceToggle}
                type="button"
              >
                {recording ? "Stop Recording" : "Record Voice"}
              </button>
              <button className="primary-button" disabled={sending || socketState !== "open" || interviewComplete} type="submit">
                {sending ? "Sending..." : "Send Message"}
              </button>
            </div>
          </div>
          {interviewComplete ? (
            <div className="hint-copy" data-testid="interview-complete-state">
              Interview complete{completionReason ? ` (${completionReason.replace("_", " ")})` : ""}.
              {reportStatus ? ` Report status: ${reportStatus}.` : ""}
              {candidateSummary ? ` Summary: ${candidateSummary}` : ""}
              {candidateScores ? ` Communication ${candidateScores.communication}/10, Clarity ${candidateScores.clarity}/10.` : ""}
            </div>
          ) : null}
          {interviewComplete && reportStatus === "ready" ? (
            <a
              className="primary-button"
              data-testid="download-report-link"
              href={reportDownloadUrl || buildConversationReportUrl(sessionId)}
              target="_blank"
              rel="noreferrer"
            >
              Download Report
            </a>
          ) : null}
          {error ? <p className="error-copy">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
