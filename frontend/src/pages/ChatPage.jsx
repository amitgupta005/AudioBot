import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import api from '../services/api';
import wsService from '../services/wsService';

const Mic = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8" y1="23" x2="16" y2="23"/>
  </svg>
);
const Stop = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2"/>
  </svg>
);
const Send = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

export default function ChatPage() {
  const { user, accessToken, sessionId, setSession, logout } = useAuthStore();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [activeTab, setActiveTab] = useState('voice'); // 'voice' | 'text'
  const messagesEndRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentSessionId = useRef(sessionId);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages]);

  // Initialize session and WebSocket
  useEffect(() => {
    const init = async () => {
      try {
        let sid = sessionId;
        if (!sid) {
          const { data } = await api.post('/chat/session/start');
          sid = data.sessionId;
          setSession(sid);
          if (data.greeting) {
            setMessages([{ role: 'assistant', content: data.greeting, id: Date.now() }]);
          }
        }
        currentSessionId.current = sid;

        // Connect WebSocket
        await wsService.connect(accessToken, sid);
        setIsConnected(true);

        wsService.on('transcript', (d) => {
          setMessages(prev => [...prev, { role: 'user', content: d.text, id: Date.now(), type: 'audio' }]);
        });
        wsService.on('response', (d) => {
          setIsBotTyping(false);
          setMessages(prev => [...prev, { role: 'assistant', content: d.text, id: Date.now() }]);
        });
        wsService.on('close', () => setIsConnected(false));
        wsService.on('error', () => toast.error('Connection error'));
      } catch (err) {
        console.error('Init error:', err);
        // WS failed, fall back to text-only mode
        setActiveTab('text');
        if (!sessionId) {
          try {
            const { data } = await api.post('/chat/session/start');
            setSession(data.sessionId);
            currentSessionId.current = data.sessionId;
            if (data.greeting) setMessages([{ role: 'assistant', content: data.greeting, id: Date.now() }]);
          } catch {}
        }
      }
    };
    init();
    return () => wsService.disconnect();
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = e => audioChunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const buffer = await blob.arrayBuffer();
        wsService.sendAudio(buffer);
        setIsBotTyping(true);
        stream.getTracks().forEach(t => t.stop());
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error('Microphone access denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const sendTextMessage = useCallback(async () => {
    const msg = input.trim();
    if (!msg || !currentSessionId.current) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg, id: Date.now() }]);
    setIsBotTyping(true);
    try {
      const { data } = await api.post('/chat/message', { message: msg, sessionId: currentSessionId.current });
      setIsBotTyping(false);
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, id: Date.now() }]);
    } catch (err) {
      setIsBotTyping(false);
      toast.error(err.response?.data?.message || 'Failed to send message');
    }
  }, [input]);

  const endSession = async () => {
    try {
      await api.post('/chat/session/end', { sessionId: currentSessionId.current });
      wsService.disconnect();
      setSession(null);
      currentSessionId.current = null;
      setMessages([]);
      setIsConnected(false);
      toast.success('Session ended');
      // Start fresh
      const { data } = await api.post('/chat/session/start');
      setSession(data.sessionId);
      currentSessionId.current = data.sessionId;
      if (data.greeting) setMessages([{ role: 'assistant', content: data.greeting, id: Date.now() }]);
    } catch {}
  };

  const handleLogout = async () => {
    wsService.disconnect();
    await logout();
    navigate('/login');
  };

  return (
    <div style={s.root}>
      {/* Header */}
      <header style={s.header}>
        <div style={s.headerLeft}>
          <span style={s.logoText}>🤖 AudioBot</span>
          <span style={{ ...s.statusDot, background: isConnected ? 'var(--accent)' : '#666' }} />
          <span style={s.statusText}>{isConnected ? 'Connected' : 'Text Mode'}</span>
        </div>
        <div style={s.headerRight}>
          <span style={s.userName}>{user?.name}</span>
          <Link to="/history" style={s.navBtn}>History</Link>
          <button style={s.navBtn} onClick={endSession}>New Session</button>
          <button style={{ ...s.navBtn, color: 'var(--danger)' }} onClick={handleLogout}>Logout</button>
        </div>
      </header>

      {/* Tab switcher */}
      <div style={s.tabs}>
        {['voice', 'text'].map(tab => (
          <button key={tab} style={{ ...s.tab, ...(activeTab === tab ? s.tabActive : {}) }} onClick={() => setActiveTab(tab)}>
            {tab === 'voice' ? '🎙️ Voice' : '💬 Text'}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={s.messages}>
        {messages.map(msg => (
          <div key={msg.id} style={{ ...s.msgRow, justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {msg.role === 'assistant' && <div style={s.botAvatar}>🤖</div>}
            <div style={{ ...s.bubble, ...(msg.role === 'user' ? s.bubbleUser : s.bubbleBot) }}>
              {msg.type === 'audio' && <span style={s.audioTag}>🎙️ </span>}
              {msg.content}
            </div>
          </div>
        ))}
        {isBotTyping && (
          <div style={{ ...s.msgRow, justifyContent: 'flex-start' }}>
            <div style={s.botAvatar}>🤖</div>
            <div style={{ ...s.bubble, ...s.bubbleBot }}>
              <span style={s.typing}>●●●</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={s.inputArea}>
        {activeTab === 'voice' ? (
          <div style={s.voiceControls}>
            <button
              style={{ ...s.micBtn, ...(isRecording ? s.micBtnActive : {}) }}
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
            >
              {isRecording ? <Stop /> : <Mic />}
            </button>
            <p style={s.micHint}>{isRecording ? 'Recording… release to send' : 'Hold to speak'}</p>
          </div>
        ) : (
          <div style={s.textControls}>
            <input
              style={s.textInput}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendTextMessage()}
              placeholder="Type a message…"
              autoFocus
            />
            <button style={s.sendBtn} onClick={sendTextMessage} disabled={!input.trim()}>
              <Send />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  root: { height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  logoText: { fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--accent)', fontWeight: 700 },
  statusDot: { width: 8, height: 8, borderRadius: '50%' },
  statusText: { fontSize: 12, color: 'var(--text-muted)' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  userName: { fontSize: 13, color: 'var(--text-muted)' },
  navBtn: { fontSize: 13, color: 'var(--text)', background: 'transparent', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' },
  tabs: { display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 },
  tab: { flex: 1, padding: '0.75rem', fontSize: 13, background: 'transparent', color: 'var(--text-muted)', borderBottom: '2px solid transparent', transition: 'all 0.2s' },
  tabActive: { color: 'var(--accent)', borderBottomColor: 'var(--accent)' },
  messages: { flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  botAvatar: { fontSize: 24, flexShrink: 0 },
  bubble: { maxWidth: '75%', padding: '0.75rem 1rem', borderRadius: 14, fontSize: 14, lineHeight: 1.5 },
  bubbleUser: { background: 'var(--accent)', color: '#000', fontWeight: 500, borderBottomRightRadius: 4 },
  bubbleBot: { background: 'var(--surface)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 },
  audioTag: { opacity: 0.6 },
  typing: { fontFamily: 'var(--font-mono)', fontSize: 20, letterSpacing: 4, animation: 'pulse-glow 1s ease-in-out infinite', color: 'var(--accent)' },
  inputArea: { padding: '1.25rem 1.5rem', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 },
  voiceControls: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  micBtn: {
    width: 72, height: 72, borderRadius: '50%', background: 'var(--surface2)', border: '2px solid var(--border)',
    color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s', userSelect: 'none',
  },
  micBtnActive: { background: 'var(--danger)', borderColor: 'var(--danger)', animation: 'pulse-glow 0.8s ease-in-out infinite', color: '#fff' },
  micHint: { fontSize: 12, color: 'var(--text-muted)' },
  textControls: { display: 'flex', gap: 10 },
  textInput: {
    flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '0.75rem 1rem', color: 'var(--text)', fontSize: 14,
  },
  sendBtn: {
    background: 'var(--accent)', color: '#000', width: 44, height: 44, borderRadius: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
};
