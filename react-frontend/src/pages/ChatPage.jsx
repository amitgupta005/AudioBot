

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import useAudioBot from '../hooks/useAudioBot';
import { conversationApi } from '../services/api'; 

// Icons
function MicIcon({ active }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
      <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill={active ? 'currentColor' : 'none'} />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function SidebarToggleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '12px', color: '#6366f1' }}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

export default function ChatPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState(""); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [sessionStep, setSessionStep] = useState('resume'); 
  const [resumeFile, setResumeFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [candidateSessions, setCandidateSessions] = useState([]);
  const [jobId, setJobId] = useState(null);

  const messagesEndRef = useRef(null);

  const { 
    isConnected, isRecording, isBotSpeaking, botResponse, transcription,
    connect, disconnect, startRecording, stopRecording, sendTextMessage 
  } = useAudioBot(sessionId, jobId);

  // Auto-scroll
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  // Handle incoming STT transcription
  useEffect(() => {
    if (transcription && transcription.text) {
      const newMsg = { role: 'user', content: transcription.text };
      setMessages((prev) => [...prev, newMsg]);
      saveToLocalHistory(sessionId, newMsg);
      saveToDatabase(sessionId, newMsg); 
    }
  }, [transcription]);

  // Handle incoming Bot response
  useEffect(() => {
    if (botResponse && botResponse.text) {
      const newMsg = { role: 'assistant', content: botResponse.text };
      setMessages((prev) => [...prev, newMsg]);
      saveToLocalHistory(sessionId, newMsg);
      saveToDatabase(sessionId, newMsg); 
    }
  }, [botResponse]);

  // Initialize jobId from URL params or localStorage
  useEffect(() => {
    const urlJobId = searchParams.get('jobId');
    if (urlJobId) {
      setJobId(urlJobId);
      localStorage.setItem('audiobot_jobId', urlJobId);
    } else {
      const savedJobId = localStorage.getItem('audiobot_jobId');
      if (savedJobId) setJobId(savedJobId);
    }
  }, [searchParams]);

  // NEW: Generate candidate-specific session ID based on user ID + timestamp
  const generateCandidateSessionId = (timestamp = Date.now()) => {
    return `${user?.id || user?.email}-session-${timestamp}`;
  };

  const saveToLocalHistory = (id, message) => {
    if (!id) return;
    const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
    if (!existingHistory[id]) {
        existingHistory[id] = { id, timestamp: Date.now(), messages: [], userId: user?.id, userName: user?.name, jobId };
    }
    existingHistory[id].messages.push(message);
    localStorage.setItem("audiobot_sessions", JSON.stringify(existingHistory));
    loadCandidateSessions();
  };

  const saveToDatabase = async (id, message) => {
    if (!id || id.startsWith("session-")) return; 
    try {
      await conversationApi.sendMessage(id, {
        role: message.role,
        content: message.content,
        type: 'text' 
      });
    } catch (err) {
      console.warn("Could not save message to database", err);
    }
  };

  // NEW: Load all sessions that belong to this candidate
  const loadCandidateSessions = () => {
    const allHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
    const userSessions = Object.values(allHistory)
      .filter(s => s.userId === user?.id || s.id.startsWith(`${user?.id}-`) || s.id.startsWith(`${user?.email}-`))
      .sort((a, b) => b.timestamp - a.timestamp);
    setCandidateSessions(userSessions);
  };

  const startSession = async () => {
    try {
      if (sessionId) disconnect(); 

      setSessionStep('resume');
      setResumeFile(null);
      setMessages([]);
      
      // Create backend conversation with jobId if available and use returned sessionId
      try {
        const response = await conversationApi.start(jobId);
        const backendSessionId = response.data.sessionId;
        setSessionId(backendSessionId); // Use backend sessionId, not local one
      } catch (err) {
        console.warn("Could not initialize backend conversation", err);
        // Fallback: use local sessionId if backend fails
        const fallbackSessionId = generateCandidateSessionId();
        setSessionId(fallbackSessionId);
      }

    } catch (err) {
      toast.error('Failed to start session');
      console.error(err);
    }
  };

  // NEW: Load a specific session belonging to this candidate
  const loadCandidateSession = (sessionToLoad) => {
    if (sessionId) disconnect();
    
    const allHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
    const conversation = allHistory[sessionToLoad.id];
    
    if (conversation) {
      setSessionId(sessionToLoad.id);
      setMessages(conversation.messages || []);
      setSessionStep('chat');
      
      // Reconnect WebSocket with the loaded session
      setTimeout(() => connect(sessionToLoad.id), 100);
    }
  };

  const handleResumeSubmit = async () => {
    if (!resumeFile || !sessionId) return;
    
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      formData.append('session_id', sessionId);
      if (jobId) formData.append('jobId', jobId);

      const response = await fetch('http://127.0.0.1:8000/api/upload-resume', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload to FastAPI');
      }

      setSessionStep('chat');
      
      const initialMsg = { role: 'assistant', content: "Hello! I've reviewed your resume. I'm your interviewer for this meeting. Let's begin!" };
      setMessages([initialMsg]);
      saveToLocalHistory(sessionId, initialMsg);
      
      setTimeout(() => connect(sessionId), 100);
      toast.success('Resume processed successfully!');

    } catch (error) {
      console.error("Resume upload error:", error);
      toast.error('Failed to process resume. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // NEW: Load candidate sessions on mount and when user changes
  useEffect(() => {
    loadCandidateSessions();

    // Auto-start first session if no sessions exist
    if (candidateSessions.length === 0 && !sessionId) {
      startSession();
    } else if (candidateSessions.length > 0 && !sessionId) {
      // Load the latest session for this candidate
      loadCandidateSession(candidateSessions[0]);
    }
    
    return () => { disconnect(); };
  }, [user?.id, user?.email]);

  const clearAllHistory = () => {
      const allHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
      // Only delete sessions belonging to this candidate
      Object.keys(allHistory).forEach((key) => {
        if (allHistory[key].userId === user?.id || key.startsWith(`${user?.id}-`) || key.startsWith(`${user?.email}-`)) {
          delete allHistory[key];
        }
      });
      localStorage.setItem("audiobot_sessions", JSON.stringify(allHistory));
      loadCandidateSessions();
      startSession();
  };

  const handleSendText = () => {
    if (!inputText.trim() || !isConnected) return;
    
    const userMsg = { role: 'user', content: inputText.trim() };
    setMessages((prev) => [...prev, userMsg]);
    saveToLocalHistory(sessionId, userMsg);
    saveToDatabase(sessionId, userMsg); 
    
    sendTextMessage(inputText.trim());
    setInputText(""); 
  };

  return (
    <div className="app-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0b0f19; color: #e2e8f0; font-family: 'DM Sans', sans-serif; }
        .app-container { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background: #0b0f19; }
        
        .global-header { display: flex; justify-content: space-between; align-items: center; height: 64px; padding: 0 24px; background: #0b0f19; border-bottom: 1px solid rgba(255,255,255,0.05); flex-shrink: 0; z-index: 30; }
        .brand { font-size: 20px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px; }
        .user-info { display: flex; align-items: center; gap: 16px; background: rgba(255, 255, 255, 0.03); padding: 6px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: blink 2s infinite; }
        .avatar { width: 30px; height: 30px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; color: white;}
        .btn-signout { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #e2e8f0; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .btn-signout:hover { background: rgba(255,255,255,0.05); }

        .workspace { display: flex; flex: 1; overflow: hidden; position: relative; }
        .btn-toggle-sidebar { position: absolute; top: 16px; left: 16px; z-index: 20; background: #151a28; border: 1px solid rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); padding: 8px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; backdrop-filter: blur(8px); }
        .btn-toggle-sidebar:hover { background: #1e2536; color: #e2e8f0; border-color: rgba(255,255,255,0.15); }

        .sidebar { background: #0b0f19; border-right: 1px solid rgba(255,255,255,0.05); transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; white-space: nowrap; }
        .sidebar.open { width: 280px; }
        .sidebar.closed { width: 0px; border-right: none; }
        .sidebar-inner { width: 280px; padding: 68px 24px 24px 24px; display: flex; flex-direction: column; height: 100%; transition: opacity 0.2s ease; opacity: 1; }
        .sidebar.closed .sidebar-inner { opacity: 0; pointer-events: none; }
        
        .btn-new-chat { background: #6366f1; color: white; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
        .btn-new-chat:hover { background: #4f46e5; }
        .recent-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); letter-spacing: 1px; margin: 32px 0 16px; text-transform: uppercase; }
        .history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        .history-item { padding: 14px 16px; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
        .history-item.active { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3); }
        .history-item:hover:not(.active) { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); }
        .history-title { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .history-preview { font-size: 13px; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sidebar-footer { margin-top: auto; padding-top: 24px; }
        .session-id-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px 16px; border-radius: 10px; font-size: 12px; color: rgba(255,255,255,0.5); font-family: monospace; margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .btn-clear { background: transparent; border: none; color: #6366f1; font-size: 13px; cursor: pointer; font-weight: 500; }
        .btn-clear:hover { text-decoration: underline; }

        .main-content { flex: 1; display: flex; flex-direction: column; background: #0f1420; position: relative; }
        
        /* RESUME UPLOAD UI */
        .upload-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px; }
        .upload-card { background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 40px; max-width: 480px; width: 100%; text-align: center; box-shadow: 0 12px 32px rgba(0,0,0,0.3); }
        .upload-card h2 { font-size: 22px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }
        .upload-card p { font-size: 14px; color: rgba(255,255,255,0.5); line-height: 1.5; margin-bottom: 32px; }
        .file-input-wrapper { position: relative; border: 2px dashed rgba(255,255,255,0.15); border-radius: 16px; padding: 40px 20px; background: rgba(255,255,255,0.02); transition: all 0.2s; cursor: pointer; margin-bottom: 24px; }
        .file-input-wrapper:hover { border-color: #6366f1; background: rgba(99,102,241,0.05); }
        .file-input-wrapper input[type="file"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
        .file-name { font-size: 14px; color: #4ade80; font-weight: 500; margin-top: 12px; word-break: break-all; }
        .btn-submit-resume { width: 100%; background: #6366f1; color: white; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .btn-submit-resume:hover:not(:disabled) { background: #4f46e5; }
        .btn-submit-resume:disabled { opacity: 0.5; cursor: not-allowed; }

        /* MESSAGES UI */
        .chat-area { flex: 1; overflow-y: auto; padding: 24px 40px 40px 40px; display: flex; flex-direction: column; gap: 24px; scroll-behavior: smooth; }
        .msg { display: flex; max-width: 75%; animation: fadeIn 0.3s ease; }
        .msg.user { align-self: flex-end; }
        .msg.assistant { align-self: flex-start; }
        .msg-bubble { padding: 14px 20px; border-radius: 16px; font-size: 15px; line-height: 1.6; }
        .msg.assistant .msg-bubble { background: #1e2536; border: 1px solid rgba(255,255,255,0.05); color: #e2e8f0; border-top-left-radius: 4px; }
        .msg.user .msg-bubble { background: #6366f1; color: white; border-top-right-radius: 4px; }
        .speaking-indicator { font-size: 13px; color: #6366f1; padding-left: 20px; animation: pulse 1.5s infinite; }

        /* INPUT AREA */
        .input-container { padding: 0 40px 40px 40px; max-width: 900px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
        .text-input-row { display: flex; align-items: center; background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 8px 12px; transition: border-color 0.2s; }
        .text-input-row:focus-within { border-color: rgba(99,102,241,0.5); }
        .text-input { flex: 1; background: transparent; border: none; color: #e2e8f0; font-family: 'DM Sans', sans-serif; font-size: 15px; padding: 12px; outline: none; }
        .text-input::placeholder { color: rgba(255,255,255,0.3); }
        .btn-send { background: #6366f1; border: none; color: white; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
        .btn-send:hover:not(:disabled) { background: #4f46e5; }
        .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
        .mic-btn-row { background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; width: 100%; color: rgba(255,255,255,0.5); font-size: 15px; display: flex; align-items: center; cursor: pointer; transition: all 0.2s; font-family: 'DM Sans', sans-serif; }
        .mic-btn-row:hover:not(:disabled) { background: #1a2033; border-color: rgba(255,255,255,0.15); color: #e2e8f0; }
        .mic-btn-row.recording { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #ef4444; }
        .mic-btn-row:disabled { opacity: 0.5; cursor: not-allowed; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>

      {/* GLOBAL TOP NAV BAR */}
      <header className="global-header">
        <div className="brand">🤖 AudioBot</div>
        <div className="user-info">
          {isConnected && <span style={{ fontSize: 12, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}><span className="status-dot" /> Live</span>}
          <div className="avatar">{user?.name?.[0]?.toUpperCase() || 'S'}</div>
          <span style={{ fontSize: 14, color: '#e2e8f0' }}>{user?.name || 'salik'}</span>
          <button className="btn-signout" onClick={logout}>Sign out</button>
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="workspace">
        <button className="btn-toggle-sidebar" onClick={() => setIsSidebarOpen(!isSidebarOpen)} title="Toggle Sidebar">
          <SidebarToggleIcon />
        </button>

        {/* LEFT SIDEBAR */}
        <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-inner">
            <button className="btn-new-chat" onClick={startSession}>
              <span>+</span> New Chat
            </button>
            <div className="recent-label">My Conversations</div>
            <div className="history-list">
              {candidateSessions.map((c) => {
                const previewText = c.messages.length > 0 ? c.messages[c.messages.length - 1].content : "New Conversation";
                const displayTitle = `Session ${new Date(c.timestamp).toLocaleDateString()}`;
                return (
                  <div key={c.id} className={`history-item ${c.id === sessionId ? 'active' : ''}`} onClick={() => loadCandidateSession(c)} title={c.id}>
                    <div className="history-title">{displayTitle}</div>
                    <div className="history-preview">{previewText.substring(0, 50)}...</div>
                  </div>
                );
              })}
            </div>
            <div className="sidebar-footer">
              <div className="session-id-box" title={sessionId}>ID: {sessionId || '...'}</div>
              <button className="btn-clear" onClick={clearAllHistory}>Clear All</button>
            </div>
          </div>
        </aside>

        {/* MAIN CONTENT AREA */}
        <main className="main-content">
          
          {/* STEP 1: RESUME UPLOAD */}
          {sessionStep === 'resume' && (
            <div className="upload-container">
              <div className="upload-card">
                <UploadIcon />
                <h2>Upload Your Resume</h2>
                <p>To personalize your interview experience, please upload your resume before we begin.</p>
                
                <div className="file-input-wrapper">
                  <input 
                    type="file" 
                    accept=".pdf,.doc,.docx" 
                    onChange={(e) => setResumeFile(e.target.files[0])} 
                  />
                  {resumeFile ? (
                    <div className="file-name">✅ {resumeFile.name}</div>
                  ) : (
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>Click or drag a file to upload (.pdf, .doc)</div>
                  )}
                </div>

                <button 
                  className="btn-submit-resume" 
                  disabled={!resumeFile || isUploading} 
                  onClick={handleResumeSubmit}
                >
                  {isUploading ? 'Processing Document...' : 'Submit & Start Interview'}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CHAT INTERFACE */}
          {sessionStep === 'chat' && (
            <>
              {/* MESSAGES */}
              <div className="chat-area">
                {messages.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>
                    <div className="msg-bubble">{m.content}</div>
                  </div>
                ))}
                {isBotSpeaking && (
                  <div className="speaking-indicator">Bot is speaking...</div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* BOTTOM INPUTS */}
              <div className="input-container">
                <div className="text-input-row">
                  <input 
                    type="text" 
                    className="text-input" 
                    placeholder={!isConnected ? "Connecting..." : isBotSpeaking ? "Wait for bot to finish..." : "Ask me anything..."} 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyPress={(e) => { if(e.key === 'Enter') handleSendText(); }}
                    disabled={!isConnected || isBotSpeaking}
                  />
                  <button className="btn-send" onClick={handleSendText} disabled={!isConnected || isBotSpeaking || !inputText.trim()}>
                    <SendIcon />
                  </button>
                </div>
                
                <button className={`mic-btn-row ${isRecording ? 'recording' : ''}`} disabled={!isConnected || isBotSpeaking || inputText.trim().length > 0} onClick={toggleRecording}>
                  <MicIcon active={isRecording} />
                  {isRecording ? "Recording... Click to Stop" : "Click to Record"}
                </button>
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  );
}