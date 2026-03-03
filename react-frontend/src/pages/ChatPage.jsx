// // import { useState, useEffect, useRef } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import toast from 'react-hot-toast';
// // import useAuthStore from '../store/authStore';
// // import useAudioBot from '../hooks/useAudioBot';

// // function MicIcon({ active }) {
// //   return (
// //     <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
// //       <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill={active ? 'currentColor' : 'none'} />
// //       <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
// //       <line x1="12" y1="19" x2="12" y2="22" />
// //       <line x1="8" y1="22" x2="16" y2="22" />
// //     </svg>
// //   );
// // }

// // export default function ChatPage() {
// //   const { user, logout } = useAuthStore();
// //   const navigate = useNavigate();
  
// //   const [sessionId, setSessionId] = useState(null);
// //   const [messages, setMessages] = useState([]);
// //   const [history, setHistory] = useState([]);
// //   const [activeTab, setActiveTab] = useState('chat');
// //   const [sessionLoading, setSessionLoading] = useState(false);
// //   const messagesEndRef = useRef(null);

// //   // Pulling state and functions from our updated useAudioBot hook
// //   const { 
// //     isConnected, isRecording, isBotSpeaking, botResponse, transcription,
// //     connect, disconnect, startRecording, stopRecording 
// //   } = useAudioBot(sessionId);

// //   // Auto-scroll to bottom of chat
// //   useEffect(() => { 
// //     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
// //   }, [messages]);

// //   // Handle incoming STT transcription (User Speech)
// //   useEffect(() => {
// //     if (transcription && transcription.text) {
// //       const newMsg = { role: 'user', content: transcription.text };
// //       setMessages((prev) => [...prev, newMsg]);
// //       saveToLocalHistory(sessionId, newMsg);
// //     }
// //   }, [transcription]);

// //   // Handle incoming Bot response
// //   useEffect(() => {
// //     if (botResponse && botResponse.text) {
// //       const newMsg = { role: 'assistant', content: botResponse.text };
// //       setMessages((prev) => [...prev, newMsg]);
// //       saveToLocalHistory(sessionId, newMsg);
// //     }
// //   }, [botResponse]);

// //   // Saving to localStorage so the history tab works without a DB
// //   const saveToLocalHistory = (id, message) => {
// //     if (!id) return;
// //     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
// //     if (!existingHistory[id]) {
// //         existingHistory[id] = { id, timestamp: Date.now(), messages: [] };
// //     }
// //     existingHistory[id].messages.push(message);
// //     localStorage.setItem("audiobot_sessions", JSON.stringify(existingHistory));
// //   };

// //   const startSession = () => {
// //     setSessionLoading(true);
// //     try {
// //       // 1. Generate session ID locally to bypass broken REST endpoint
// //       const newSessionId = "session-" + Math.floor(Math.random() * 10000);
// //       setSessionId(newSessionId);
      
// //       // 2. Set initial greeting message
// //       const initialMsg = { role: 'assistant', content: "👋 Hello! I'm AudioBot. Press and hold the mic button to speak with me." };
// //       setMessages([initialMsg]);
// //       saveToLocalHistory(newSessionId, initialMsg);

// //       // 3. Connect directly to WebSocket
// //       setTimeout(() => connect(newSessionId), 100);
// //       toast.success('Session started!');
// //     } catch (err) {
// //       toast.error('Failed to start session');
// //       console.error(err);
// //     } finally {
// //       setSessionLoading(false);
// //     }
// //   };

// //   const endSession = () => {
// //     if (!sessionId) return;
// //     disconnect();
// //     setSessionId(null);
// //     setMessages([]);
// //     toast.success('Session ended');
// //   };

// //   const loadHistory = () => {
// //     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
// //     const sessionsArray = Object.values(existingHistory).sort((a, b) => b.timestamp - a.timestamp);
// //     setHistory(sessionsArray);
// //   };

// //   // Load history when tab switches
// //   useEffect(() => { 
// //     if (activeTab === 'history') loadHistory(); 
// //   }, [activeTab]);

// //   return (
// //     <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 60%, #0a0f1a 100%)', fontFamily: "'DM Sans', sans-serif", color: '#e2e8f0', display: 'flex', flexDirection: 'column' }}>
// //       <style>{`
// //         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');
// //         * { box-sizing: border-box; }
// //         .header { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-bottom: 1px solid rgba(255,255,255,0.07); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 10; background: rgba(10,10,15,0.8); }
// //         .logo-text { font-family: 'Syne', sans-serif; font-size: 20px; font-weight: 800; background: linear-gradient(135deg, #e2e8f0, #7c9ae0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
// //         .user-info { display: flex; align-items: center; gap: 12px; }
// //         .avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #3b6cf4, #7c9ae0); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; }
// //         .btn-ghost { background: transparent; border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.6); padding: 7px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
// //         .btn-ghost:hover { background: rgba(255,255,255,0.06); color: #e2e8f0; }
// //         .tabs { display: flex; gap: 4px; padding: 16px 24px 0; border-bottom: 1px solid rgba(255,255,255,0.07); }
// //         .tab { padding: 10px 18px; border-radius: 8px 8px 0 0; cursor: pointer; font-size: 14px; font-weight: 500; color: rgba(255,255,255,0.4); transition: all 0.2s; border: 1px solid transparent; border-bottom: none; }
// //         .tab.active { color: #e2e8f0; background: rgba(255,255,255,0.04); border-color: rgba(255,255,255,0.08); }
// //         .main { flex: 1; display: flex; flex-direction: column; max-width: 900px; width: 100%; margin: 0 auto; padding: 0 24px; }
// //         .chat-area { flex: 1; overflow-y: auto; padding: 24px 0; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
// //         .msg { display: flex; gap: 12px; max-width: 75%; animation: fadeIn 0.3s ease; }
// //         .msg.user { align-self: flex-end; flex-direction: row-reverse; }
// //         .msg-bubble { padding: 12px 16px; border-radius: 16px; font-size: 14px; line-height: 1.6; }
// //         .msg.assistant .msg-bubble { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); border-top-left-radius: 4px; }
// //         .msg.user .msg-bubble { background: linear-gradient(135deg, rgba(59,108,244,0.4), rgba(91,138,244,0.3)); border: 1px solid rgba(59,108,244,0.3); border-top-right-radius: 4px; }
// //         .msg-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; margin-top: 2px; }
// //         .bot-icon { background: linear-gradient(135deg, #3b6cf4, #7c9ae0); }
// //         .user-icon { background: rgba(255,255,255,0.1); }
// //         .controls { padding: 24px 0; display: flex; flex-direction: column; align-items: center; gap: 20px; border-top: 1px solid rgba(255,255,255,0.07); }
// //         .session-bar { display: flex; gap: 12px; align-items: center; }
// //         .btn-session { padding: 10px 20px; border-radius: 10px; border: none; cursor: pointer; font-size: 14px; font-weight: 600; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
// //         .btn-start { background: linear-gradient(135deg, #3b6cf4, #5b8af4); color: white; }
// //         .btn-start:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
// //         .btn-end { background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.3); color: #f87171; }
// //         .btn-end:hover { background: rgba(239,68,68,0.3); }
// //         .btn-session:disabled { opacity: 0.4; cursor: not-allowed; }
// //         .mic-wrap { position: relative; display: flex; flex-direction: column; align-items: center; gap: 12px; }
// //         .mic-btn { width: 80px; height: 80px; border-radius: 50%; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
// //         .mic-btn.idle { background: rgba(255,255,255,0.07); border: 2px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.5); }
// //         .mic-btn.idle:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
// //         .mic-btn.recording { background: linear-gradient(135deg, #ef4444, #f87171); border: 2px solid transparent; color: white; animation: pulse 1.5s infinite; }
// //         .mic-btn:disabled { opacity: 0.3; cursor: not-allowed; }
// //         .mic-hint { font-size: 12px; color: rgba(255,255,255,0.3); }
// //         .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; display: inline-block; margin-right: 6px; animation: blink 2s infinite; }
// //         .speaking-indicator { font-size: 13px; color: #7c9ae0; }
// //         .history-list { padding: 24px 0; display: flex; flex-direction: column; gap: 12px; }
// //         .hist-item { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 16px 20px; cursor: pointer; transition: all 0.2s; }
// //         .hist-item:hover { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.12); }
// //         .hist-title { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
// //         .hist-meta { font-size: 12px; color: rgba(255,255,255,0.3); display: flex; gap: 16px; }
// //         .empty { text-align: center; color: rgba(255,255,255,0.3); padding: 60px 0; font-size: 14px; }
// //         @keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); } 50% { box-shadow: 0 0 0 16px rgba(239,68,68,0); } }
// //         @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
// //         @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
// //       `}</style>

// //       <div className="header">
// //         <div className="logo-text">🎙️ AudioBot</div>
// //         <div className="user-info">
// //           {isConnected && <span style={{ fontSize: 12, color: '#4ade80' }}><span className="status-dot" />Live</span>}
// //           <div className="avatar">{user?.name?.[0]?.toUpperCase() || 'S'}</div>
// //           <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>{user?.name || 'User'}</span>
// //           {user?.role === 'admin' && <button className="btn-ghost" onClick={() => navigate('/admin')}>Admin</button>}
// //           <button className="btn-ghost" onClick={logout}>Sign out</button>
// //         </div>
// //       </div>

// //       <div className="tabs">
// //         {['chat', 'history'].map((t) => (
// //           <div key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
// //             {t.charAt(0).toUpperCase() + t.slice(1)}
// //           </div>
// //         ))}
// //       </div>

// //       <div className="main">
// //         {activeTab === 'chat' && (
// //           <>
// //             <div className="chat-area">
// //               {messages.length === 0 && (
// //                 <div className="empty">
// //                   <div style={{ fontSize: 48, marginBottom: 16 }}>🎙️</div>
// //                   <div>Start a session to begin your conversation</div>
// //                 </div>
// //               )}
// //               {messages.map((m, i) => (
// //                 <div key={i} className={`msg ${m.role}`}>
// //                   <div className={`msg-icon ${m.role === 'assistant' ? 'bot-icon' : 'user-icon'}`}>
// //                     {m.role === 'assistant' ? '🤖' : '👤'}
// //                   </div>
// //                   <div className="msg-bubble">{m.content}</div>
// //                 </div>
// //               ))}
// //               {isBotSpeaking && (
// //                 <div className="speaking-indicator">🔊 AudioBot is speaking...</div>
// //               )}
// //               <div ref={messagesEndRef} />
// //             </div>

// //             <div className="controls">
// //               <div className="session-bar">
// //                 {!sessionId ? (
// //                   <button className="btn-session btn-start" onClick={startSession} disabled={sessionLoading}>
// //                     {sessionLoading ? 'Starting...' : '▶ Start Session'}
// //                   </button>
// //                 ) : (
// //                   <button className="btn-session btn-end" onClick={endSession}>■ End Session</button>
// //                 )}
// //               </div>

// //               {sessionId && (
// //                 <div className="mic-wrap">
// //                   <button
// //                     className={`mic-btn ${isRecording ? 'recording' : 'idle'}`}
// //                     disabled={!isConnected || isBotSpeaking}
// //                     onMouseDown={startRecording}
// //                     onMouseUp={stopRecording}
// //                     onTouchStart={startRecording}
// //                     onTouchEnd={stopRecording}
// //                   >
// //                     <MicIcon active={isRecording} />
// //                   </button>
// //                   <div className="mic-hint">
// //                     {!isConnected ? 'Connecting...' : isRecording ? '🔴 Recording — release to send' : isBotSpeaking ? '🔊 Bot speaking...' : 'Hold to record'}
// //                   </div>
// //                 </div>
// //               )}
// //             </div>
// //           </>
// //         )}

// //         {activeTab === 'history' && (
// //           <div className="history-list">
// //             {history.length === 0 ? (
// //               <div className="empty">No conversations yet</div>
// //             ) : (
// //               history.map((c) => (
// //                 <div key={c.id} className="hist-item">
// //                   <div className="hist-title">{c.id}</div>
// //                   <div className="hist-meta">
// //                     <span>{c.messages.length} messages</span>
// //                     <span>{new Date(c.timestamp).toLocaleString()}</span>
// //                   </div>
// //                 </div>
// //               ))
// //             )}
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // }





// // import { useState, useEffect, useRef } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import toast from 'react-hot-toast';
// // import useAuthStore from '../store/authStore';
// // import useAudioBot from '../hooks/useAudioBot';

// // // Icons
// // function MicIcon({ active }) {
// //   return (
// //     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
// //       <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill={active ? 'currentColor' : 'none'} />
// //       <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
// //       <line x1="12" y1="19" x2="12" y2="22" />
// //     </svg>
// //   );
// // }

// // function SendIcon() {
// //   return (
// //     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
// //       <line x1="22" y1="2" x2="11" y2="13" />
// //       <polygon points="22 2 15 22 11 13 2 9 22 2" />
// //     </svg>
// //   );
// // }

// // export default function ChatPage() {
// //   const { user, logout } = useAuthStore();
// //   const navigate = useNavigate();
  
// //   const [sessionId, setSessionId] = useState(null);
// //   const [messages, setMessages] = useState([]);
// //   const [history, setHistory] = useState([]);
// //   const [inputText, setInputText] = useState(""); 
// //   const messagesEndRef = useRef(null);

// //   const { 
// //     isConnected, isRecording, isBotSpeaking, botResponse, transcription,
// //     connect, disconnect, startRecording, stopRecording, sendTextMessage 
// //   } = useAudioBot(sessionId);

// //   // Auto-scroll
// //   useEffect(() => { 
// //     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
// //   }, [messages]);

// //   // Handle incoming STT transcription
// //   useEffect(() => {
// //     if (transcription && transcription.text) {
// //       const newMsg = { role: 'user', content: transcription.text };
// //       setMessages((prev) => [...prev, newMsg]);
// //       saveToLocalHistory(sessionId, newMsg);
// //     }
// //   }, [transcription]);

// //   // Handle incoming Bot response
// //   useEffect(() => {
// //     if (botResponse && botResponse.text) {
// //       const newMsg = { role: 'assistant', content: botResponse.text };
// //       setMessages((prev) => [...prev, newMsg]);
// //       saveToLocalHistory(sessionId, newMsg);
// //     }
// //   }, [botResponse]);

// //   const saveToLocalHistory = (id, message) => {
// //     if (!id) return;
// //     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
// //     if (!existingHistory[id]) {
// //         existingHistory[id] = { id, timestamp: Date.now(), messages: [] };
// //     }
// //     existingHistory[id].messages.push(message);
// //     localStorage.setItem("audiobot_sessions", JSON.stringify(existingHistory));
// //     loadHistory(); // Refresh sidebar
// //   };

// //   const startSession = () => {
// //     try {
// //       if (sessionId) disconnect(); // Clean up old session if clicking New Chat

// //       const newSessionId = "session-" + Math.floor(Math.random() * 10000);
// //       setSessionId(newSessionId);
      
// //       const initialMsg = { role: 'assistant', content: "Hello! I'm your interviewer for this meeting. Let's begin!" };
// //       setMessages([initialMsg]);
// //       saveToLocalHistory(newSessionId, initialMsg);

// //       setTimeout(() => connect(newSessionId), 100);
// //     } catch (err) {
// //       toast.error('Failed to start session');
// //       console.error(err);
// //     }
// //   };

// //   // Auto-start session if no history exists, otherwise load latest
// //   useEffect(() => {
// //     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
// //     const sessionIds = Object.keys(existingHistory);
    
// //     if (sessionIds.length > 0 && !sessionId) {
// //       const latestId = sessionIds.sort((a, b) => existingHistory[b].timestamp - existingHistory[a].timestamp)[0];
// //       loadConversation(latestId);
// //     } else if (!sessionId) {
// //       startSession();
// //     }
    
// //     return () => { disconnect(); };
// //   }, []);

// //   const loadHistory = () => {
// //     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
// //     const sessionsArray = Object.values(existingHistory).sort((a, b) => b.timestamp - a.timestamp);
// //     setHistory(sessionsArray);
// //   };

// //   const loadConversation = (id) => {
// //     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
// //     if (existingHistory[id]) {
// //         if (sessionId) disconnect();
// //         setSessionId(id);
// //         setMessages(existingHistory[id].messages);
// //         setTimeout(() => connect(id), 100);
// //     }
// //   };

// //   const clearAllHistory = () => {
// //       localStorage.removeItem("audiobot_sessions");
// //       setHistory([]);
// //       startSession();
// //   };

// //   const handleSendText = () => {
// //     if (!inputText.trim() || !isConnected) return;
    
// //     const userMsg = { role: 'user', content: inputText.trim() };
// //     setMessages((prev) => [...prev, userMsg]);
// //     saveToLocalHistory(sessionId, userMsg);
    
// //     sendTextMessage(inputText.trim());
// //     setInputText(""); 
// //   };

// //   return (
// //     <div className="app-container">
// //       <style>{`
// //         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
// //         * { box-sizing: border-box; margin: 0; padding: 0; }
// //         body { background: #0b0f19; color: #e2e8f0; font-family: 'DM Sans', sans-serif; }
        
// //         .app-container { display: flex; height: 100vh; overflow: hidden; background: #0b0f19; }
        
// //         /* SIDEBAR */
// //         .sidebar { width: 280px; background: #0b0f19; border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; padding: 24px; }
// //         .brand { font-size: 20px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px; margin-bottom: 32px; }
        
// //         .btn-new-chat { background: #6366f1; color: white; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
// //         .btn-new-chat:hover { background: #4f46e5; }
        
// //         .recent-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); letter-spacing: 1px; margin: 32px 0 16px; text-transform: uppercase; }
        
// //         .history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        
// //         .history-item { padding: 14px 16px; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
// //         .history-item.active { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3); }
// //         .history-item:hover:not(.active) { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); }
        
// //         .history-title { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
// //         .history-preview { font-size: 13px; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
// //         .sidebar-footer { margin-top: auto; padding-top: 24px; }
// //         .session-id-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px 16px; border-radius: 10px; font-size: 12px; color: rgba(255,255,255,0.5); font-family: monospace; margin-bottom: 12px; }
// //         .btn-clear { background: transparent; border: none; color: #6366f1; font-size: 13px; cursor: pointer; font-weight: 500; }
// //         .btn-clear:hover { text-decoration: underline; }

// //         /* MAIN CHAT AREA */
// //         .main-content { flex: 1; display: flex; flex-direction: column; background: #0f1420; position: relative; }
        
// //         /* TOP HEADER (Right side) */
// //         .top-header { display: flex; justify-content: flex-end; align-items: center; padding: 16px 32px; background: transparent; position: absolute; top: 0; right: 0; width: 100%; z-index: 10; }
// //         .user-info { display: flex; align-items: center; gap: 16px; background: rgba(11, 15, 25, 0.6); padding: 8px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
// //         .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: blink 2s infinite; }
// //         .avatar { width: 32px; height: 32px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: white;}
// //         .btn-signout { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #e2e8f0; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
// //         .btn-signout:hover { background: rgba(255,255,255,0.05); }

// //         /* MESSAGES */
// //         .chat-area { flex: 1; overflow-y: auto; padding: 80px 40px 40px 40px; display: flex; flex-direction: column; gap: 24px; scroll-behavior: smooth; }
        
// //         .msg { display: flex; max-width: 75%; animation: fadeIn 0.3s ease; }
// //         .msg.user { align-self: flex-end; }
// //         .msg.assistant { align-self: flex-start; }
        
// //         .msg-bubble { padding: 14px 20px; border-radius: 16px; font-size: 15px; line-height: 1.6; }
// //         .msg.assistant .msg-bubble { background: #1e2536; border: 1px solid rgba(255,255,255,0.05); color: #e2e8f0; border-top-left-radius: 4px; }
// //         .msg.user .msg-bubble { background: #6366f1; color: white; border-top-right-radius: 4px; }
        
// //         .speaking-indicator { font-size: 13px; color: #6366f1; padding-left: 20px; animation: pulse 1.5s infinite; }

// //         /* INPUT AREA */
// //         .input-container { padding: 0 40px 40px 40px; max-width: 900px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
        
// //         .text-input-row { display: flex; align-items: center; background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 8px 12px; transition: border-color 0.2s; }
// //         .text-input-row:focus-within { border-color: rgba(99,102,241,0.5); }
        
// //         .text-input { flex: 1; background: transparent; border: none; color: #e2e8f0; font-family: 'DM Sans', sans-serif; font-size: 15px; padding: 12px; outline: none; }
// //         .text-input::placeholder { color: rgba(255,255,255,0.3); }
        
// //         .btn-send { background: #6366f1; border: none; color: white; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
// //         .btn-send:hover:not(:disabled) { background: #4f46e5; }
// //         .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
        
// //         .mic-btn-row { background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; width: 100%; color: rgba(255,255,255,0.5); font-size: 15px; display: flex; align-items: center; cursor: pointer; transition: all 0.2s; font-family: 'DM Sans', sans-serif; }
// //         .mic-btn-row:hover:not(:disabled) { background: #1a2033; border-color: rgba(255,255,255,0.15); color: #e2e8f0; }
// //         .mic-btn-row.recording { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #ef4444; }
// //         .mic-btn-row:disabled { opacity: 0.5; cursor: not-allowed; }

// //         @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
// //         @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
// //         @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
// //       `}</style>

// //       {/* LEFT SIDEBAR */}
// //       <aside className="sidebar">
// //         <div className="brand">🤖 AudioBot</div>
        
// //         <button className="btn-new-chat" onClick={startSession}>
// //           <span>+</span> New Chat
// //         </button>
        
// //         <div className="recent-label">Recent Conversations</div>
        
// //         <div className="history-list">
// //           {history.map((c) => {
// //             const previewText = c.messages.length > 0 ? c.messages[c.messages.length - 1].content : "New Conversation";
// //             return (
// //               <div 
// //                 key={c.id} 
// //                 className={`history-item ${c.id === sessionId ? 'active' : ''}`}
// //                 onClick={() => loadConversation(c.id)}
// //               >
// //                 <div className="history-title">{c.id}</div>
// //                 <div className="history-preview">{previewText}</div>
// //               </div>
// //             );
// //           })}
// //         </div>
        
// //         <div className="sidebar-footer">
// //           <div className="session-id-box">ID: {sessionId || '...'}</div>
// //           <button className="btn-clear" onClick={clearAllHistory}>Clear All</button>
// //         </div>
// //       </aside>

// //       {/* MAIN CONTENT AREA */}
// //       <main className="main-content">
        
// //         {/* TOP USER INFO HEADER */}
// //         <header className="top-header">
// //           <div className="user-info">
// //             {isConnected && <span style={{ fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}><span className="status-dot" /> Live</span>}
// //             <div className="avatar">{user?.name?.[0]?.toUpperCase() || 'S'}</div>
// //             <span style={{ fontSize: 14, color: '#e2e8f0' }}>{user?.name || 'salik'}</span>
// //             <button className="btn-signout" onClick={logout}>Sign out</button>
// //           </div>
// //         </header>

// //         {/* MESSAGES */}
// //         <div className="chat-area">
// //           {messages.map((m, i) => (
// //             <div key={i} className={`msg ${m.role}`}>
// //               <div className="msg-bubble">{m.content}</div>
// //             </div>
// //           ))}
// //           {isBotSpeaking && (
// //             <div className="speaking-indicator">Bot is speaking...</div>
// //           )}
// //           <div ref={messagesEndRef} />
// //         </div>

// //         {/* BOTTOM INPUTS */}
// //         <div className="input-container">
// //           {/* 1. Text Input */}
// //           <div className="text-input-row">
// //             <input 
// //               type="text" 
// //               className="text-input" 
// //               placeholder={!isConnected ? "Connecting..." : isBotSpeaking ? "Wait for bot to finish..." : "Ask me anything..."} 
// //               value={inputText}
// //               onChange={(e) => setInputText(e.target.value)}
// //               onKeyPress={(e) => { if(e.key === 'Enter') handleSendText(); }}
// //               disabled={!isConnected || isBotSpeaking}
// //             />
// //             <button 
// //               className="btn-send" 
// //               onClick={handleSendText}
// //               disabled={!isConnected || isBotSpeaking || !inputText.trim()}
// //             >
// //               <SendIcon />
// //             </button>
// //           </div>
          
// //           {/* 2. Audio Record Button */}
// //           <button
// //             className={`mic-btn-row ${isRecording ? 'recording' : ''}`}
// //             disabled={!isConnected || isBotSpeaking || inputText.trim().length > 0}
// //             onMouseDown={startRecording}
// //             onMouseUp={stopRecording}
// //             onTouchStart={startRecording}
// //             onTouchEnd={stopRecording}
// //           >
// //             <MicIcon active={isRecording} />
// //             {isRecording ? "Recording... Release to send" : "Press to Record"}
// //           </button>
// //         </div>
        
// //       </main>
// //     </div>
// //   );
// // }




// import { useState, useEffect, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import toast from 'react-hot-toast';
// import useAuthStore from '../store/authStore';
// import useAudioBot from '../hooks/useAudioBot';

// // Icons
// function MicIcon({ active }) {
//   return (
//     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
//       <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill={active ? 'currentColor' : 'none'} />
//       <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
//       <line x1="12" y1="19" x2="12" y2="22" />
//     </svg>
//   );
// }

// function SendIcon() {
//   return (
//     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <line x1="22" y1="2" x2="11" y2="13" />
//       <polygon points="22 2 15 22 11 13 2 9 22 2" />
//     </svg>
//   );
// }

// // New Sidebar Toggle Icon
// function SidebarToggleIcon() {
//   return (
//     <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
//       <line x1="9" y1="3" x2="9" y2="21" />
//     </svg>
//   );
// }

// export default function ChatPage() {
//   const { user, logout } = useAuthStore();
//   const navigate = useNavigate();
  
//   const [sessionId, setSessionId] = useState(null);
//   const [messages, setMessages] = useState([]);
//   const [history, setHistory] = useState([]);
//   const [inputText, setInputText] = useState(""); 
//   const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Sidebar state
//   const messagesEndRef = useRef(null);

//   const { 
//     isConnected, isRecording, isBotSpeaking, botResponse, transcription,
//     connect, disconnect, startRecording, stopRecording, sendTextMessage 
//   } = useAudioBot(sessionId);

//   // Auto-scroll
//   useEffect(() => { 
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
//   }, [messages]);

//   // Handle incoming STT transcription
//   useEffect(() => {
//     if (transcription && transcription.text) {
//       const newMsg = { role: 'user', content: transcription.text };
//       setMessages((prev) => [...prev, newMsg]);
//       saveToLocalHistory(sessionId, newMsg);
//     }
//   }, [transcription]);

//   // Handle incoming Bot response
//   useEffect(() => {
//     if (botResponse && botResponse.text) {
//       const newMsg = { role: 'assistant', content: botResponse.text };
//       setMessages((prev) => [...prev, newMsg]);
//       saveToLocalHistory(sessionId, newMsg);
//     }
//   }, [botResponse]);

//   const saveToLocalHistory = (id, message) => {
//     if (!id) return;
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     if (!existingHistory[id]) {
//         existingHistory[id] = { id, timestamp: Date.now(), messages: [] };
//     }
//     existingHistory[id].messages.push(message);
//     localStorage.setItem("audiobot_sessions", JSON.stringify(existingHistory));
//     loadHistory(); // Refresh sidebar
//   };

//   const startSession = () => {
//     try {
//       if (sessionId) disconnect(); 

//       const newSessionId = "session-" + Math.floor(Math.random() * 10000);
//       setSessionId(newSessionId);
      
//       const initialMsg = { role: 'assistant', content: "Hello! I'm your interviewer for this meeting. Let's begin!" };
//       setMessages([initialMsg]);
//       saveToLocalHistory(newSessionId, initialMsg);

//       setTimeout(() => connect(newSessionId), 100);
//     } catch (err) {
//       toast.error('Failed to start session');
//       console.error(err);
//     }
//   };

//   // Auto-start session if no history exists, otherwise load latest
//   useEffect(() => {
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     const sessionIds = Object.keys(existingHistory);
    
//     if (sessionIds.length > 0 && !sessionId) {
//       const latestId = sessionIds.sort((a, b) => existingHistory[b].timestamp - existingHistory[a].timestamp)[0];
//       loadConversation(latestId);
//     } else if (!sessionId) {
//       startSession();
//     }
    
//     return () => { disconnect(); };
//   }, []);

//   const loadHistory = () => {
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     const sessionsArray = Object.values(existingHistory).sort((a, b) => b.timestamp - a.timestamp);
//     setHistory(sessionsArray);
//   };

//   const loadConversation = (id) => {
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     if (existingHistory[id]) {
//         if (sessionId) disconnect();
//         setSessionId(id);
//         setMessages(existingHistory[id].messages);
//         setTimeout(() => connect(id), 100);
//     }
//   };

//   const clearAllHistory = () => {
//       localStorage.removeItem("audiobot_sessions");
//       setHistory([]);
//       startSession();
//   };

//   const handleSendText = () => {
//     if (!inputText.trim() || !isConnected) return;
    
//     const userMsg = { role: 'user', content: inputText.trim() };
//     setMessages((prev) => [...prev, userMsg]);
//     saveToLocalHistory(sessionId, userMsg);
    
//     sendTextMessage(inputText.trim());
//     setInputText(""); 
//   };

//   return (
//     <div className="app-container">
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
//         * { box-sizing: border-box; margin: 0; padding: 0; }
//         body { background: #0b0f19; color: #e2e8f0; font-family: 'DM Sans', sans-serif; }
        
//         .app-container { display: flex; height: 100vh; overflow: hidden; background: #0b0f19; }
        
//         /* SIDEBAR WITH COLLAPSE ANIMATION */
//         .sidebar { background: #0b0f19; border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; white-space: nowrap; }
//         .sidebar.open { width: 280px; }
//         .sidebar.closed { width: 0px; border-right: none; }
        
//         .sidebar-inner { width: 280px; padding: 24px; display: flex; flex-direction: column; height: 100%; transition: opacity 0.2s ease; opacity: 1; }
//         .sidebar.closed .sidebar-inner { opacity: 0; pointer-events: none; }

//         .brand { font-size: 20px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px; margin-bottom: 32px; }
        
//         .btn-new-chat { background: #6366f1; color: white; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
//         .btn-new-chat:hover { background: #4f46e5; }
        
//         .recent-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); letter-spacing: 1px; margin: 32px 0 16px; text-transform: uppercase; }
        
//         .history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        
//         .history-item { padding: 14px 16px; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
//         .history-item.active { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3); }
//         .history-item:hover:not(.active) { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); }
        
//         .history-title { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
//         .history-preview { font-size: 13px; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
//         .sidebar-footer { margin-top: auto; padding-top: 24px; }
//         .session-id-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px 16px; border-radius: 10px; font-size: 12px; color: rgba(255,255,255,0.5); font-family: monospace; margin-bottom: 12px; }
//         .btn-clear { background: transparent; border: none; color: #6366f1; font-size: 13px; cursor: pointer; font-weight: 500; }
//         .btn-clear:hover { text-decoration: underline; }

//         /* MAIN CHAT AREA */
//         .main-content { flex: 1; display: flex; flex-direction: column; background: #0f1420; position: relative; }
        
//         /* TOP HEADER (Toggle & User Info) */
//         .top-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; position: absolute; top: 0; left: 0; width: 100%; z-index: 10; pointer-events: none; }
        
//         /* Enable clicking on children even if parent has pointer-events: none */
//         .header-left, .user-info { pointer-events: auto; }
        
//         .btn-toggle-sidebar { background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 8px; transition: all 0.2s; background: rgba(11, 15, 25, 0.6); border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
//         .btn-toggle-sidebar:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

//         .user-info { display: flex; align-items: center; gap: 16px; background: rgba(11, 15, 25, 0.6); padding: 8px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
//         .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: blink 2s infinite; }
//         .avatar { width: 32px; height: 32px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: white;}
//         .btn-signout { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #e2e8f0; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
//         .btn-signout:hover { background: rgba(255,255,255,0.05); }

//         /* MESSAGES */
//         .chat-area { flex: 1; overflow-y: auto; padding: 80px 40px 40px 40px; display: flex; flex-direction: column; gap: 24px; scroll-behavior: smooth; }
        
//         .msg { display: flex; max-width: 75%; animation: fadeIn 0.3s ease; }
//         .msg.user { align-self: flex-end; }
//         .msg.assistant { align-self: flex-start; }
        
//         .msg-bubble { padding: 14px 20px; border-radius: 16px; font-size: 15px; line-height: 1.6; }
//         .msg.assistant .msg-bubble { background: #1e2536; border: 1px solid rgba(255,255,255,0.05); color: #e2e8f0; border-top-left-radius: 4px; }
//         .msg.user .msg-bubble { background: #6366f1; color: white; border-top-right-radius: 4px; }
        
//         .speaking-indicator { font-size: 13px; color: #6366f1; padding-left: 20px; animation: pulse 1.5s infinite; }

//         /* INPUT AREA */
//         .input-container { padding: 0 40px 40px 40px; max-width: 900px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
        
//         .text-input-row { display: flex; align-items: center; background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 8px 12px; transition: border-color 0.2s; }
//         .text-input-row:focus-within { border-color: rgba(99,102,241,0.5); }
        
//         .text-input { flex: 1; background: transparent; border: none; color: #e2e8f0; font-family: 'DM Sans', sans-serif; font-size: 15px; padding: 12px; outline: none; }
//         .text-input::placeholder { color: rgba(255,255,255,0.3); }
        
//         .btn-send { background: #6366f1; border: none; color: white; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
//         .btn-send:hover:not(:disabled) { background: #4f46e5; }
//         .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
        
//         .mic-btn-row { background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; width: 100%; color: rgba(255,255,255,0.5); font-size: 15px; display: flex; align-items: center; cursor: pointer; transition: all 0.2s; font-family: 'DM Sans', sans-serif; }
//         .mic-btn-row:hover:not(:disabled) { background: #1a2033; border-color: rgba(255,255,255,0.15); color: #e2e8f0; }
//         .mic-btn-row.recording { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #ef4444; }
//         .mic-btn-row:disabled { opacity: 0.5; cursor: not-allowed; }

//         @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
//         @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
//         @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
//       `}</style>

//       {/* LEFT SIDEBAR */}
//       <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
//         <div className="sidebar-inner">
//           <div className="brand">🤖 AudioBot</div>
          
//           <button className="btn-new-chat" onClick={startSession}>
//             <span>+</span> New Chat
//           </button>
          
//           <div className="recent-label">Recent Conversations</div>
          
//           <div className="history-list">
//             {history.map((c) => {
//               const previewText = c.messages.length > 0 ? c.messages[c.messages.length - 1].content : "New Conversation";
//               return (
//                 <div 
//                   key={c.id} 
//                   className={`history-item ${c.id === sessionId ? 'active' : ''}`}
//                   onClick={() => loadConversation(c.id)}
//                 >
//                   <div className="history-title">{c.id}</div>
//                   <div className="history-preview">{previewText}</div>
//                 </div>
//               );
//             })}
//           </div>
          
//           <div className="sidebar-footer">
//             <div className="session-id-box">ID: {sessionId || '...'}</div>
//             <button className="btn-clear" onClick={clearAllHistory}>Clear All</button>
//           </div>
//         </div>
//       </aside>

//       {/* MAIN CONTENT AREA */}
//       <main className="main-content">
        
//         {/* TOP HEADER */}
//         <header className="top-header">
//           {/* Toggle Button */}
//           <div className="header-left">
//             <button 
//               className="btn-toggle-sidebar" 
//               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
//               title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
//             >
//               <SidebarToggleIcon />
//             </button>
//           </div>

//           {/* User Info & Sign Out */}
//           <div className="user-info">
//             {isConnected && <span style={{ fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}><span className="status-dot" /> Live</span>}
//             <div className="avatar">{user?.name?.[0]?.toUpperCase() || 'S'}</div>
//             <span style={{ fontSize: 14, color: '#e2e8f0' }}>{user?.name || 'salik'}</span>
//             <button className="btn-signout" onClick={logout}>Sign out</button>
//           </div>
//         </header>

//         {/* MESSAGES */}
//         <div className="chat-area">
//           {messages.map((m, i) => (
//             <div key={i} className={`msg ${m.role}`}>
//               <div className="msg-bubble">{m.content}</div>
//             </div>
//           ))}
//           {isBotSpeaking && (
//             <div className="speaking-indicator">Bot is speaking...</div>
//           )}
//           <div ref={messagesEndRef} />
//         </div>

//         {/* BOTTOM INPUTS */}
//         <div className="input-container">
//           {/* 1. Text Input */}
//           <div className="text-input-row">
//             <input 
//               type="text" 
//               className="text-input" 
//               placeholder={!isConnected ? "Connecting..." : isBotSpeaking ? "Wait for bot to finish..." : "Ask me anything..."} 
//               value={inputText}
//               onChange={(e) => setInputText(e.target.value)}
//               onKeyPress={(e) => { if(e.key === 'Enter') handleSendText(); }}
//               disabled={!isConnected || isBotSpeaking}
//             />
//             <button 
//               className="btn-send" 
//               onClick={handleSendText}
//               disabled={!isConnected || isBotSpeaking || !inputText.trim()}
//             >
//               <SendIcon />
//             </button>
//           </div>
          
//           {/* 2. Audio Record Button */}
//           <button
//             className={`mic-btn-row ${isRecording ? 'recording' : ''}`}
//             disabled={!isConnected || isBotSpeaking || inputText.trim().length > 0}
//             onMouseDown={startRecording}
//             onMouseUp={stopRecording}
//             onTouchStart={startRecording}
//             onTouchEnd={stopRecording}
//           >
//             <MicIcon active={isRecording} />
//             {isRecording ? "Recording... Release to send" : "Press to Record"}
//           </button>
//         </div>
        
//       </main>
//     </div>
//   );
// }

// import { useState, useEffect, useRef } from 'react';
// import { useNavigate } from 'react-router-dom';
// import toast from 'react-hot-toast';
// import useAuthStore from '../store/authStore';
// import useAudioBot from '../hooks/useAudioBot';

// // ⚠️ We added your API import back here so we can talk to Node/MongoDB!
// import { conversationApi } from '../services/api'; 

// // Icons
// function MicIcon({ active }) {
//   return (
//     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '8px' }}>
//       <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" fill={active ? 'currentColor' : 'none'} />
//       <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
//       <line x1="12" y1="19" x2="12" y2="22" />
//     </svg>
//   );
// }

// function SendIcon() {
//   return (
//     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <line x1="22" y1="2" x2="11" y2="13" />
//       <polygon points="22 2 15 22 11 13 2 9 22 2" />
//     </svg>
//   );
// }

// function SidebarToggleIcon() {
//   return (
//     <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
//       <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
//       <line x1="9" y1="3" x2="9" y2="21" />
//     </svg>
//   );
// }

// export default function ChatPage() {
//   const { user, logout } = useAuthStore();
//   const navigate = useNavigate();
  
//   const [sessionId, setSessionId] = useState(null);
//   const [messages, setMessages] = useState([]);
//   const [history, setHistory] = useState([]);
//   const [inputText, setInputText] = useState(""); 
//   const [isSidebarOpen, setIsSidebarOpen] = useState(true);
//   const messagesEndRef = useRef(null);

//   const { 
//     isConnected, isRecording, isBotSpeaking, botResponse, transcription,
//     connect, disconnect, startRecording, stopRecording, sendTextMessage 
//   } = useAudioBot(sessionId);

//   // Auto-scroll
//   useEffect(() => { 
//     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
//   }, [messages]);

//   // Handle incoming STT transcription
//   useEffect(() => {
//     if (transcription && transcription.text) {
//       const newMsg = { role: 'user', content: transcription.text };
//       setMessages((prev) => [...prev, newMsg]);
//       saveToLocalHistory(sessionId, newMsg);
//       saveToDatabase(sessionId, newMsg); // Sync to Mongo
//     }
//   }, [transcription]);

//   // Handle incoming Bot response
//   useEffect(() => {
//     if (botResponse && botResponse.text) {
//       const newMsg = { role: 'assistant', content: botResponse.text };
//       setMessages((prev) => [...prev, newMsg]);
//       saveToLocalHistory(sessionId, newMsg);
//       saveToDatabase(sessionId, newMsg); // Sync to Mongo
//     }
//   }, [botResponse]);

//   const saveToLocalHistory = (id, message) => {
//     if (!id) return;
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     if (!existingHistory[id]) {
//         existingHistory[id] = { id, timestamp: Date.now(), messages: [] };
//     }
//     existingHistory[id].messages.push(message);
//     localStorage.setItem("audiobot_sessions", JSON.stringify(existingHistory));
//     loadHistory(); 
//   };

//   // Helper to send messages to MongoDB
//   const saveToDatabase = async (id, message) => {
//     if (!id || id.startsWith("session-")) return; // Don't sync fallback local sessions
//     try {
//       await conversationApi.sendMessage(id, {
//         role: message.role,
//         content: message.content,
//         type: 'text' // You can change to 'audio' if your schema requires it
//       });
//     } catch (err) {
//       console.warn("Could not save message to database", err);
//     }
//   };

//   const startSession = async () => {
//     try {
//       if (sessionId) disconnect(); 

//       let newSessionId;
//       try {
//         // 1. Try to ask Node backend to create a DB record first
//         const { data } = await conversationApi.start();
//         newSessionId = data.sessionId; 
//       } catch (dbErr) {
//         console.warn("Node API failed, using local ID instead", dbErr);
//         newSessionId = "session-" + Math.floor(Math.random() * 10000); // Fallback
//       }

//       setSessionId(newSessionId);
      
//       const initialMsg = { role: 'assistant', content: "Hello! I'm your interviewer for this meeting. Let's begin!" };
//       setMessages([initialMsg]);
//       saveToLocalHistory(newSessionId, initialMsg);

//       setTimeout(() => connect(newSessionId), 100);
//     } catch (err) {
//       toast.error('Failed to start session');
//       console.error(err);
//     }
//   };

//   // Click-to-record toggle logic
//   const toggleRecording = () => {
//     if (isRecording) {
//       stopRecording();
//     } else {
//       startRecording();
//     }
//   };

//   // Auto-start session if no history exists, otherwise load latest
//   useEffect(() => {
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     const sessionIds = Object.keys(existingHistory);
    
//     if (sessionIds.length > 0 && !sessionId) {
//       const latestId = sessionIds.sort((a, b) => existingHistory[b].timestamp - existingHistory[a].timestamp)[0];
//       loadConversation(latestId);
//     } else if (!sessionId) {
//       startSession();
//     }
    
//     return () => { disconnect(); };
//   }, []);

//   const loadHistory = () => {
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     const sessionsArray = Object.values(existingHistory).sort((a, b) => b.timestamp - a.timestamp);
//     setHistory(sessionsArray);
//   };

//   const loadConversation = (id) => {
//     const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
//     if (existingHistory[id]) {
//         if (sessionId) disconnect();
//         setSessionId(id);
//         setMessages(existingHistory[id].messages);
//         setTimeout(() => connect(id), 100);
//     }
//   };

//   const clearAllHistory = () => {
//       localStorage.removeItem("audiobot_sessions");
//       setHistory([]);
//       startSession();
//   };

//   const handleSendText = () => {
//     if (!inputText.trim() || !isConnected) return;
    
//     const userMsg = { role: 'user', content: inputText.trim() };
//     setMessages((prev) => [...prev, userMsg]);
//     saveToLocalHistory(sessionId, userMsg);
//     saveToDatabase(sessionId, userMsg); // Sync to Mongo
    
//     sendTextMessage(inputText.trim());
//     setInputText(""); 
//   };

//   return (
//     <div className="app-container">
//       <style>{`
//         @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        
//         * { box-sizing: border-box; margin: 0; padding: 0; }
//         body { background: #0b0f19; color: #e2e8f0; font-family: 'DM Sans', sans-serif; }
        
//         .app-container { display: flex; height: 100vh; overflow: hidden; background: #0b0f19; }
        
//         /* SIDEBAR WITH COLLAPSE ANIMATION */
//         .sidebar { background: #0b0f19; border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; white-space: nowrap; }
//         .sidebar.open { width: 280px; }
//         .sidebar.closed { width: 0px; border-right: none; }
        
//         .sidebar-inner { width: 280px; padding: 24px; display: flex; flex-direction: column; height: 100%; transition: opacity 0.2s ease; opacity: 1; }
//         .sidebar.closed .sidebar-inner { opacity: 0; pointer-events: none; }

//         .brand { font-size: 20px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px; margin-bottom: 32px; }
        
//         .btn-new-chat { background: #6366f1; color: white; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
//         .btn-new-chat:hover { background: #4f46e5; }
        
//         .recent-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); letter-spacing: 1px; margin: 32px 0 16px; text-transform: uppercase; }
        
//         .history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        
//         .history-item { padding: 14px 16px; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
//         .history-item.active { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3); }
//         .history-item:hover:not(.active) { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); }
        
//         .history-title { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; }
//         .history-preview { font-size: 13px; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
//         .sidebar-footer { margin-top: auto; padding-top: 24px; }
//         .session-id-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px 16px; border-radius: 10px; font-size: 12px; color: rgba(255,255,255,0.5); font-family: monospace; margin-bottom: 12px; }
//         .btn-clear { background: transparent; border: none; color: #6366f1; font-size: 13px; cursor: pointer; font-weight: 500; }
//         .btn-clear:hover { text-decoration: underline; }

//         /* MAIN CHAT AREA */
//         .main-content { flex: 1; display: flex; flex-direction: column; background: #0f1420; position: relative; }
        
//         /* TOP HEADER */
//         .top-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; position: absolute; top: 0; left: 0; width: 100%; z-index: 10; pointer-events: none; }
        
//         .header-left, .user-info { pointer-events: auto; }
        
//         .btn-toggle-sidebar { background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 8px; transition: all 0.2s; background: rgba(11, 15, 25, 0.6); border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
//         .btn-toggle-sidebar:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

//         .user-info { display: flex; align-items: center; gap: 16px; background: rgba(11, 15, 25, 0.6); padding: 8px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
//         .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: blink 2s infinite; }
//         .avatar { width: 32px; height: 32px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: white;}
//         .btn-signout { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #e2e8f0; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
//         .btn-signout:hover { background: rgba(255,255,255,0.05); }

//         /* MESSAGES */
//         .chat-area { flex: 1; overflow-y: auto; padding: 80px 40px 40px 40px; display: flex; flex-direction: column; gap: 24px; scroll-behavior: smooth; }
        
//         .msg { display: flex; max-width: 75%; animation: fadeIn 0.3s ease; }
//         .msg.user { align-self: flex-end; }
//         .msg.assistant { align-self: flex-start; }
        
//         .msg-bubble { padding: 14px 20px; border-radius: 16px; font-size: 15px; line-height: 1.6; }
//         .msg.assistant .msg-bubble { background: #1e2536; border: 1px solid rgba(255,255,255,0.05); color: #e2e8f0; border-top-left-radius: 4px; }
//         .msg.user .msg-bubble { background: #6366f1; color: white; border-top-right-radius: 4px; }
        
//         .speaking-indicator { font-size: 13px; color: #6366f1; padding-left: 20px; animation: pulse 1.5s infinite; }

//         /* INPUT AREA */
//         .input-container { padding: 0 40px 40px 40px; max-width: 900px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; }
        
//         .text-input-row { display: flex; align-items: center; background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 8px 12px; transition: border-color 0.2s; }
//         .text-input-row:focus-within { border-color: rgba(99,102,241,0.5); }
        
//         .text-input { flex: 1; background: transparent; border: none; color: #e2e8f0; font-family: 'DM Sans', sans-serif; font-size: 15px; padding: 12px; outline: none; }
//         .text-input::placeholder { color: rgba(255,255,255,0.3); }
        
//         .btn-send { background: #6366f1; border: none; color: white; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; }
//         .btn-send:hover:not(:disabled) { background: #4f46e5; }
//         .btn-send:disabled { opacity: 0.5; cursor: not-allowed; }
        
//         .mic-btn-row { background: #151a28; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 16px; width: 100%; color: rgba(255,255,255,0.5); font-size: 15px; display: flex; align-items: center; cursor: pointer; transition: all 0.2s; font-family: 'DM Sans', sans-serif; }
//         .mic-btn-row:hover:not(:disabled) { background: #1a2033; border-color: rgba(255,255,255,0.15); color: #e2e8f0; }
//         .mic-btn-row.recording { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.4); color: #ef4444; }
//         .mic-btn-row:disabled { opacity: 0.5; cursor: not-allowed; }

//         @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
//         @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
//         @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
//       `}</style>

//       {/* LEFT SIDEBAR */}
//       <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
//         <div className="sidebar-inner">
//           <div className="brand">🤖 AudioBot</div>
          
//           <button className="btn-new-chat" onClick={startSession}>
//             <span>+</span> New Chat
//           </button>
          
//           <div className="recent-label">Recent Conversations</div>
          
//           <div className="history-list">
//             {history.map((c) => {
//               const previewText = c.messages.length > 0 ? c.messages[c.messages.length - 1].content : "New Conversation";
//               return (
//                 <div 
//                   key={c.id} 
//                   className={`history-item ${c.id === sessionId ? 'active' : ''}`}
//                   onClick={() => loadConversation(c.id)}
//                 >
//                   <div className="history-title">{c.id}</div>
//                   <div className="history-preview">{previewText}</div>
//                 </div>
//               );
//             })}
//           </div>
          
//           <div className="sidebar-footer">
//             <div className="session-id-box">ID: {sessionId || '...'}</div>
//             <button className="btn-clear" onClick={clearAllHistory}>Clear All</button>
//           </div>
//         </div>
//       </aside>

//       {/* MAIN CONTENT AREA */}
//       <main className="main-content">
        
//         {/* TOP HEADER */}
//         <header className="top-header">
//           {/* Toggle Button */}
//           <div className="header-left">
//             <button 
//               className="btn-toggle-sidebar" 
//               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
//               title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
//             >
//               <SidebarToggleIcon />
//             </button>
//           </div>

//           {/* User Info & Sign Out */}
//           <div className="user-info">
//             {isConnected && <span style={{ fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}><span className="status-dot" /> Live</span>}
//             <div className="avatar">{user?.name?.[0]?.toUpperCase() || 'S'}</div>
//             <span style={{ fontSize: 14, color: '#e2e8f0' }}>{user?.name || 'salik'}</span>
//             <button className="btn-signout" onClick={logout}>Sign out</button>
//           </div>
//         </header>

//         {/* MESSAGES */}
//         <div className="chat-area">
//           {messages.map((m, i) => (
//             <div key={i} className={`msg ${m.role}`}>
//               <div className="msg-bubble">{m.content}</div>
//             </div>
//           ))}
//           {isBotSpeaking && (
//             <div className="speaking-indicator">Bot is speaking...</div>
//           )}
//           <div ref={messagesEndRef} />
//         </div>

//         {/* BOTTOM INPUTS */}
//         <div className="input-container">
//           {/* 1. Text Input */}
//           <div className="text-input-row">
//             <input 
//               type="text" 
//               className="text-input" 
//               placeholder={!isConnected ? "Connecting..." : isBotSpeaking ? "Wait for bot to finish..." : "Ask me anything..."} 
//               value={inputText}
//               onChange={(e) => setInputText(e.target.value)}
//               onKeyPress={(e) => { if(e.key === 'Enter') handleSendText(); }}
//               disabled={!isConnected || isBotSpeaking}
//             />
//             <button 
//               className="btn-send" 
//               onClick={handleSendText}
//               disabled={!isConnected || isBotSpeaking || !inputText.trim()}
//             >
//               <SendIcon />
//             </button>
//           </div>
          
//           {/* 2. Audio Record Toggle Button */}
//           <button
//             className={`mic-btn-row ${isRecording ? 'recording' : ''}`}
//             disabled={!isConnected || isBotSpeaking || inputText.trim().length > 0}
//             onClick={toggleRecording}
//           >
//             <MicIcon active={isRecording} />
//             {isRecording ? "Recording... Click to Stop" : "Click to Record"}
//           </button>
//         </div>
        
//       </main>
//     </div>
//   );
// }


import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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

export default function ChatPage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [inputText, setInputText] = useState(""); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef(null);

  const { 
    isConnected, isRecording, isBotSpeaking, botResponse, transcription,
    connect, disconnect, startRecording, stopRecording, sendTextMessage 
  } = useAudioBot(sessionId);

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

  const saveToLocalHistory = (id, message) => {
    if (!id) return;
    const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
    if (!existingHistory[id]) {
        existingHistory[id] = { id, timestamp: Date.now(), messages: [] };
    }
    existingHistory[id].messages.push(message);
    localStorage.setItem("audiobot_sessions", JSON.stringify(existingHistory));
    loadHistory(); 
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

  const startSession = async () => {
    try {
      if (sessionId) disconnect(); 

      let newSessionId;
      try {
        const { data } = await conversationApi.start();
        newSessionId = data.sessionId; 
      } catch (dbErr) {
        console.warn("Node API failed, using local ID instead", dbErr);
        newSessionId = "session-" + Math.floor(Math.random() * 10000);
      }

      setSessionId(newSessionId);
      
      const initialMsg = { role: 'assistant', content: "Hello! I'm your interviewer for this meeting. Let's begin!" };
      setMessages([initialMsg]);
      saveToLocalHistory(newSessionId, initialMsg);

      setTimeout(() => connect(newSessionId), 100);
    } catch (err) {
      toast.error('Failed to start session');
      console.error(err);
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Auto-start session & load history on page load
  useEffect(() => {
    // FIX 1: Explicitly load history right when the component mounts!
    loadHistory();

    const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
    const sessionIds = Object.keys(existingHistory);
    
    if (sessionIds.length > 0 && !sessionId) {
      const latestId = sessionIds.sort((a, b) => existingHistory[b].timestamp - existingHistory[a].timestamp)[0];
      loadConversation(latestId);
    } else if (!sessionId) {
      startSession();
    }
    
    return () => { disconnect(); };
  }, []);

  const loadHistory = () => {
    const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
    const sessionsArray = Object.values(existingHistory).sort((a, b) => b.timestamp - a.timestamp);
    setHistory(sessionsArray);
  };

  const loadConversation = (id) => {
    const existingHistory = JSON.parse(localStorage.getItem("audiobot_sessions") || "{}");
    if (existingHistory[id]) {
        if (sessionId) disconnect();
        setSessionId(id);
        setMessages(existingHistory[id].messages);
        setTimeout(() => connect(id), 100);
    }
  };

  const clearAllHistory = () => {
      localStorage.removeItem("audiobot_sessions");
      setHistory([]);
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
        
        .app-container { display: flex; height: 100vh; overflow: hidden; background: #0b0f19; }
        
        /* SIDEBAR WITH COLLAPSE ANIMATION */
        .sidebar { background: #0b0f19; border-right: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; white-space: nowrap; }
        .sidebar.open { width: 280px; }
        .sidebar.closed { width: 0px; border-right: none; }
        
        .sidebar-inner { width: 280px; padding: 24px; display: flex; flex-direction: column; height: 100%; transition: opacity 0.2s ease; opacity: 1; }
        .sidebar.closed .sidebar-inner { opacity: 0; pointer-events: none; }

        .brand { font-size: 20px; font-weight: 700; color: #ffffff; display: flex; align-items: center; gap: 8px; margin-bottom: 32px; }
        
        .btn-new-chat { background: #6366f1; color: white; border: none; padding: 14px; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(99,102,241,0.25); }
        .btn-new-chat:hover { background: #4f46e5; }
        
        .recent-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); letter-spacing: 1px; margin: 32px 0 16px; text-transform: uppercase; }
        
        .history-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
        
        .history-item { padding: 14px 16px; border-radius: 12px; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
        .history-item.active { background: rgba(99,102,241,0.1); border-color: rgba(99,102,241,0.3); }
        .history-item:hover:not(.active) { background: rgba(255,255,255,0.03); border-color: rgba(255,255,255,0.08); }
        
        /* FIX 2: Truncate long history titles */
        .history-title { font-size: 14px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .history-preview { font-size: 13px; color: rgba(255,255,255,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .sidebar-footer { margin-top: auto; padding-top: 24px; }
        
        /* FIX 2: Truncate long session IDs inside the box */
        .session-id-box { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); padding: 12px 16px; border-radius: 10px; font-size: 12px; color: rgba(255,255,255,0.5); font-family: monospace; margin-bottom: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        
        .btn-clear { background: transparent; border: none; color: #6366f1; font-size: 13px; cursor: pointer; font-weight: 500; }
        .btn-clear:hover { text-decoration: underline; }

        /* MAIN CHAT AREA */
        .main-content { flex: 1; display: flex; flex-direction: column; background: #0f1420; position: relative; }
        
        /* TOP HEADER */
        .top-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 32px; position: absolute; top: 0; left: 0; width: 100%; z-index: 10; pointer-events: none; }
        
        .header-left, .user-info { pointer-events: auto; }
        
        .btn-toggle-sidebar { background: transparent; border: none; color: rgba(255,255,255,0.5); cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 10px; border-radius: 8px; transition: all 0.2s; background: rgba(11, 15, 25, 0.6); border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
        .btn-toggle-sidebar:hover { background: rgba(255,255,255,0.1); color: #e2e8f0; }

        .user-info { display: flex; align-items: center; gap: 16px; background: rgba(11, 15, 25, 0.6); padding: 8px 16px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(10px); }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; animation: blink 2s infinite; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; background: #6366f1; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: white;}
        .btn-signout { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: #e2e8f0; padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s; }
        .btn-signout:hover { background: rgba(255,255,255,0.05); }

        /* MESSAGES */
        .chat-area { flex: 1; overflow-y: auto; padding: 80px 40px 40px 40px; display: flex; flex-direction: column; gap: 24px; scroll-behavior: smooth; }
        
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

      {/* LEFT SIDEBAR */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-inner">
          <div className="brand">🤖 AudioBot</div>
          
          <button className="btn-new-chat" onClick={startSession}>
            <span>+</span> New Chat
          </button>
          
          <div className="recent-label">Recent Conversations</div>
          
          <div className="history-list">
            {history.map((c) => {
              const previewText = c.messages.length > 0 ? c.messages[c.messages.length - 1].content : "New Conversation";
              return (
                <div 
                  key={c.id} 
                  className={`history-item ${c.id === sessionId ? 'active' : ''}`}
                  onClick={() => loadConversation(c.id)}
                  title={c.id} // Added hover title so you can see full ID
                >
                  <div className="history-title">{c.id}</div>
                  <div className="history-preview">{previewText}</div>
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
        
        {/* TOP HEADER */}
        <header className="top-header">
          {/* Toggle Button */}
          <div className="header-left">
            <button 
              className="btn-toggle-sidebar" 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
            >
              <SidebarToggleIcon />
            </button>
          </div>

          {/* User Info & Sign Out */}
          <div className="user-info">
            {isConnected && <span style={{ fontSize: 13, color: '#4ade80', display: 'flex', alignItems: 'center', gap: '6px' }}><span className="status-dot" /> Live</span>}
            <div className="avatar">{user?.name?.[0]?.toUpperCase() || 'S'}</div>
            <span style={{ fontSize: 14, color: '#e2e8f0' }}>{user?.name || 'salik'}</span>
            <button className="btn-signout" onClick={logout}>Sign out</button>
          </div>
        </header>

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
          {/* 1. Text Input */}
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
            <button 
              className="btn-send" 
              onClick={handleSendText}
              disabled={!isConnected || isBotSpeaking || !inputText.trim()}
            >
              <SendIcon />
            </button>
          </div>
          
          {/* 2. Audio Record Toggle Button */}
          <button
            className={`mic-btn-row ${isRecording ? 'recording' : ''}`}
            disabled={!isConnected || isBotSpeaking || inputText.trim().length > 0}
            onClick={toggleRecording}
          >
            <MicIcon active={isRecording} />
            {isRecording ? "Recording... Click to Stop" : "Click to Record"}
          </button>
        </div>
        
      </main>
    </div>
  );
}