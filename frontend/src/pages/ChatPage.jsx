import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { clearAuthSession, getAuthUser } from "../lib/authStore";
import {
  buildConversationReportUrl,
  createChatSocket,
  downloadConversationReport,
  fetchAuthenticatedConversation,
  resolveApiUrl,
} from "../lib/api";
import { listKnownSessions, startNewSession, touchSession } from "../lib/sessionStore";

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

function formatClock(value) {
  if (!value) {
    return "";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function formatSessionTime(value) {
  if (!value) {
    return "No activity yet";
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildUiMessage(type, content, createdAt = new Date().toISOString()) {
  return { type, content, createdAt };
}

function dedupeTranscript(messages) {
  return messages.filter((message) => message.type !== "system");
}

function normalizeConversationPayload(conversation, sessionId) {
  const transcript = (conversation.messages || []).map((message, index) => ({
    type: message.type,
    content: message.data?.content || "",
    createdAt: message.data?.created_at || new Date(Date.now() - (conversation.messages.length - index) * 60000).toISOString(),
  }));
  const systemMessage = transcript.find((message) => message.type === "system")?.content || "";
  const visibleMessages = dedupeTranscript(transcript);
  const report = conversation.candidate_report || null;

  return {
    messages: visibleMessages,
    systemMessage,
    interviewComplete: Boolean(report),
    candidateSummary: report?.summary || "",
    candidateScores: report?.scores || null,
    reportDownloadUrl: resolveApiUrl(
      conversation.candidate_report_pdf ? buildConversationReportUrl(sessionId) : "",
    ),
  };
}

export default function ChatPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const user = getAuthUser();
  const socketRef = useRef(null);
  const sendLockRef = useRef(false);
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
  const [candidateSummary, setCandidateSummary] = useState("");
  const [candidateScores, setCandidateScores] = useState(null);
  const [reportDownloadUrl, setReportDownloadUrl] = useState("");
  const [activityNote, setActivityNote] = useState("Waiting for your next message.");
  const [panelTab, setPanelTab] = useState("conversation");

  useEffect(() => {
    touchSession(sessionId);
  }, [sessionId]);

  useEffect(() => {
    let active = true;

    async function loadSessionState() {
      setLoading(true);
      setError("");

      try {
        const conversation = await fetchAuthenticatedConversation(sessionId);

        if (!active) {
          return;
        }

        const nextState = normalizeConversationPayload(conversation, sessionId);
        setMessages(nextState.messages);
        setSystemMessage(nextState.systemMessage);
        setInterviewComplete(nextState.interviewComplete);
        setCandidateSummary(nextState.candidateSummary);
        setCandidateScores(nextState.candidateScores);
        setReportDownloadUrl(nextState.reportDownloadUrl);
        setActivityNote(
          nextState.interviewComplete
            ? "Interview is complete. Review the summary and download the report."
            : nextState.messages.length
              ? "Session restored. You can continue from the latest question."
              : "Context loaded. Start with a short introduction to kick off the interview."
        );
        setSessions(dedupeSessions(listKnownSessions(), [], sessionId));
      } catch (loadError) {
        if (!active) {
          return;
        }

        setMessages([]);
        setSessions(dedupeSessions(listKnownSessions(), [], sessionId));
        setSystemMessage("");
        setInterviewComplete(false);
        setCandidateSummary("");
        setCandidateScores(null);
        setReportDownloadUrl("");
        setActivityNote("Interview context not available yet. Join a scheduled interview from the candidate portal.");
        setError(loadError.message || "Could not load this interview session yet.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadSessionState();
    return () => {
      active = false;
    };
  }, [sessionId]);

  useEffect(() => {
    const socket = createChatSocket(sessionId);
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
            // Audio playback is optional for the UI.
          }
          return;
        }

        const payload = JSON.parse(event.data);
        if (payload.error) {
          setError(payload.error);
          setSending(false);
          sendLockRef.current = false;
          setRecording(false);
          setActivityNote(payload.error);
          if (payload.interview_complete) {
            setInterviewComplete(true);
            setReportDownloadUrl(resolveApiUrl(payload.report_download_url) || buildConversationReportUrl(sessionId));
          }
          return;
        }

        if (payload.type === "transcription") {
          setMessages((current) => [...current, buildUiMessage("human", payload.text)]);
          setActivityNote("Voice note captured. Waiting for AudioBot's reply.");
          setPanelTab("conversation");
          return;
        }

        if (payload.type === "response") {
          setMessages((current) => [...current, buildUiMessage("ai", payload.text)]);
          setSending(false);
          sendLockRef.current = false;
          setRecording(false);
          setInterviewComplete(Boolean(payload.interview_complete));
          setReportDownloadUrl(resolveApiUrl(payload.report_download_url || ""));
          setActivityNote(
            payload.interview_complete
              ? "Interview complete. Pulling the latest report details now."
              : "AudioBot responded. You're ready for the next turn."
          );

          try {
            const conversation = await fetchAuthenticatedConversation(sessionId);
            const nextState = normalizeConversationPayload(conversation, sessionId);
            setMessages(nextState.messages);
            setSystemMessage(nextState.systemMessage);
            setInterviewComplete(nextState.interviewComplete);
            setCandidateSummary(nextState.candidateSummary);
            setCandidateScores(nextState.candidateScores);
            setReportDownloadUrl(nextState.reportDownloadUrl);
          } catch {
            // Keep optimistic state if fetch is unavailable.
          }
        }
      } catch {
        setError("Unexpected message received from the backend.");
        setSending(false);
        sendLockRef.current = false;
        setRecording(false);
      }
    });

    return () => {
      socket.close();
    };
  }, [sessionId]);

  useEffect(() => () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    }
  }, []);

  function handleSend(event) {
    event?.preventDefault?.();
    const trimmed = input.trim();

    if (
      sendLockRef.current
      || !trimmed
      || sending
      || recording
      || interviewComplete
      || !socketRef.current
      || socketRef.current.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    sendLockRef.current = true;
    setError("");
    setSending(true);
    setActivityNote("Message sent. AudioBot is analyzing your response.");
    setMessages((current) => [...current, buildUiMessage("human", trimmed)]);
    setInput("");
    setPanelTab("conversation");
    socketRef.current.send(
      JSON.stringify({
        type: "text",
        message: trimmed,
      }),
    );
  }

  function handleNewSession() {
    startNewSession();
    navigate("/candidate");
  }

  function handleSignOut() {
    clearAuthSession();
    navigate("/");
  }

  async function handleDownloadReport() {
    try {
      const blob = await downloadConversationReport(sessionId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${sessionId}-candidate-report.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || "Unable to download report.");
    }
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
          sendLockRef.current = true;
          setSending(true);
          setRecording(false);
          setActivityNote("Uploading your voice answer for transcription.");
          socketRef.current.send(JSON.stringify({ type: "audio" }));
          socketRef.current.send(audioBlob);
        } catch {
          setError("Audio capture failed.");
          setSending(false);
          sendLockRef.current = false;
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
      setActivityNote("Recording your response. Press again to stop.");
    } catch {
      setError("Microphone permission was denied.");
    }
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
  }, [messages, panelTab]);

  const currentQuestion = [...messages].reverse().find((message) => message.type === "ai")?.content
    || "Start by introducing yourself when the interviewer prompt appears.";
  const recentSessionLabel = sessions[0]?.lastVisitedAt || sessions[0]?.createdAt;
  const transcriptText = messages
    .map((message) => `${message.type === "human" ? "Candidate" : "AudioBot"}: ${message.content}`)
    .join("\n\n");

  return (
    <main className="interview-shell">
      <header className="interview-topbar">
        <div>
          <p className="brand-mark">AudioBot</p>
        </div>
        <nav aria-label="Portal navigation" className="interview-portals">
          {(user?.role === "recruiter" || user?.role === "admin") ? (
            <button className="portal-tab" onClick={() => navigate("/recruiter")} type="button">
              Recruiter Access
            </button>
          ) : null}
          <button className="portal-tab is-active" type="button">
            Candidate Portal
          </button>
          <button className="ghost-button" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </nav>
      </header>

      <section className="session-banner">
        <div className="session-banner-status">
          <span className={`session-dot ${socketState}`} />
          <span>Live Interview Session</span>
        </div>
        <div className="session-banner-identity">
          <span className="ai-badge">AI</span>
          <div>
            <strong>{user?.full_name || user?.email || "Candidate"} & AudioBot</strong>
            <p>{activityNote}</p>
          </div>
        </div>
      </section>

      <section className="interview-grid">
        <section className="interview-main-column">
          <article className="interviewer-stage-card">
            <div className="stage-copy">
              <p className="eyebrow">AI Interviewer</p>
              <h1>AudioBot Interview Agent</h1>
              <p className="stage-subtitle">
                {recording
                  ? "Listening to your answer and capturing your response."
                  : sending
                    ? "\"Analyzing your response and preparing the next observation...\""
                    : "The interview is live. Speak naturally or type when you want precision."}
              </p>
            </div>
            <div className={`waveform ${recording ? "is-recording" : sending ? "is-active" : ""}`} aria-hidden="true">
              {Array.from({ length: 7 }).map((_, index) => (
                <span key={index} style={{ animationDelay: `${index * 0.09}s` }} />
              ))}
            </div>
          </article>

          <div className="interview-info-grid">
            <article className="question-card">
              <div className="question-icon">Q</div>
              <div>
                <p className="eyebrow">Current Question</p>
                <p className="question-text">{currentQuestion}</p>
              </div>
            </article>

            <article className="candidate-presence-card">
              <div className="candidate-avatar-card">
                <div className="candidate-avatar">{(user?.full_name || user?.email || "C").slice(0, 1).toUpperCase()}</div>
                <span className={`presence-dot ${socketState === "open" ? "is-live" : ""}`} />
              </div>
              <div className="candidate-presence-copy">
                <strong>{user?.full_name || "Candidate Session"}</strong>
                <span>{user?.role === "recruiter" || user?.role === "admin" ? "Recruiter review mode" : "Candidate interview mode"}</span>
                <div className="presence-meter">
                  <span>Input</span>
                  <div className="presence-bars" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              </div>
            </article>
          </div>

          <section className="session-utility-row">
            <div className="session-progress-card">
              <span className="session-track-icon">◦</span>
              <div className="session-progress-track">
                <span style={{ width: `${Math.min(100, Math.max(messages.length, 1) * 12)}%` }} />
              </div>
              <span className="session-progress-note">
                {recentSessionLabel ? `Last active ${formatSessionTime(recentSessionLabel)}` : "Fresh session"}
              </span>
            </div>
            <button
              className={`control-button ${recording ? "is-live" : ""}`}
              disabled={sending || socketState !== "open" || interviewComplete}
              onClick={handleVoiceToggle}
              type="button"
            >
              {recording ? "Stop Recording" : "Record Voice"}
            </button>
            <button className="control-button" onClick={() => setSystemExpanded((value) => !value)} type="button">
              {systemExpanded ? "Hide Prompt" : "View Prompt"}
            </button>
            {interviewComplete && reportDownloadUrl ? (
              <button className="control-button emphasis" data-testid="download-report-link" onClick={handleDownloadReport} type="button">
                Download Report
              </button>
            ) : (
              <button className="control-button danger" onClick={handleNewSession} type="button">
                New Session
              </button>
            )}
          </section>

          {systemExpanded ? (
            <pre className="interview-system-prompt">{systemMessage || "No system prompt loaded for this session yet."}</pre>
          ) : null}
        </section>

        <aside className="conversation-panel">
          <div className="conversation-panel-tabs">
            <button
              className={`conversation-tab ${panelTab === "conversation" ? "is-active" : ""}`}
              onClick={() => setPanelTab("conversation")}
              type="button"
            >
              Conversation
            </button>
            <button
              className={`conversation-tab ${panelTab === "transcript" ? "is-active" : ""}`}
              onClick={() => setPanelTab("transcript")}
              type="button"
            >
              Transcript
            </button>
          </div>

          <div className="conversation-panel-body" data-testid="chat-stream" ref={chatStreamRef}>
            {panelTab === "conversation" ? (
              <>
                {loading ? <p className="empty-copy">Loading session state...</p> : null}
                {!loading && messages.length === 0 ? (
                  <p className="empty-copy">
                    Start with an introduction and respond naturally as the interview progresses.
                  </p>
                ) : null}
                {messages.map((message, index) => (
                  <article key={`${message.type}-${index}`} className={`session-message ${message.type}`}>
                    <span>{message.type === "human" ? user?.full_name || "Candidate" : "AudioBot"}</span>
                    <div className={`session-bubble ${message.type}`}>
                      <p>{message.content}</p>
                    </div>
                    <small>{formatClock(message.createdAt)}</small>
                  </article>
                ))}
                {sending ? <div className="analysis-pill">AI is analyzing response...</div> : null}
              </>
            ) : (
              <div className="transcript-panel">
                <p className="transcript-label">Session Transcript</p>
                <pre>{transcriptText || "Transcript will appear here as the conversation builds."}</pre>
              </div>
            )}
          </div>

          <form className="session-composer" onSubmit={handleSend}>
            <div className="session-composer-input">
              <textarea
                disabled={interviewComplete}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSend(event);
                  }
                }}
                placeholder={interviewComplete ? "Interview complete. Start a new session to continue." : "Type your response or supplement..."}
                readOnly={interviewComplete}
                rows={3}
                value={input}
              />
              <button className="composer-send" disabled={sending || socketState !== "open" || interviewComplete} type="submit">
                Send
              </button>
            </div>
            <div className="session-composer-footer">
              <span>Candidate can type or speak responses.</span>
              <code>{sessionId}</code>
            </div>
            {interviewComplete ? (
              <div className="hint-copy" data-testid="interview-complete-state">
                Interview complete.
                {candidateSummary ? ` Summary: ${candidateSummary}` : ""}
                {candidateScores ? ` Communication ${candidateScores.communication}/10, Clarity ${candidateScores.clarity}/10.` : ""}
              </div>
            ) : null}
            {error ? <p className="error-copy">{error}</p> : null}
          </form>
        </aside>
      </section>
    </main>
  );
}
