import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function HistoryPage() {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/chat/history').then(({ data }) => {
      setConversations(data.conversations || []);
      setLoading(false);
    });
  }, []);

  const loadConversation = async (sessionId) => {
    const { data } = await api.get(`/chat/history/${sessionId}`);
    setSelected(data.conversation);
  };

  return (
    <div style={s.root}>
      <header style={s.header}>
        <span style={s.logo}>🤖 AudioBot</span>
        <Link to="/chat" style={s.backBtn}>← Back to Chat</Link>
      </header>

      <div style={s.content}>
        <div style={s.sidebar}>
          <h2 style={s.sideTitle}>Conversations</h2>
          {loading ? (
            <p style={s.muted}>Loading…</p>
          ) : conversations.length === 0 ? (
            <p style={s.muted}>No conversations yet</p>
          ) : (
            conversations.map(c => (
              <button key={c._id} style={{ ...s.convItem, ...(selected?.sessionId === c.sessionId ? s.convItemActive : {}) }}
                onClick={() => loadConversation(c.sessionId)}>
                <div style={s.convTitle}>{c.title || 'Conversation'}</div>
                <div style={s.convMeta}>
                  {c.messageCount} messages · {new Date(c.createdAt).toLocaleDateString()}
                </div>
                <span style={{ ...s.badge, background: c.isActive ? 'var(--accent-dim)' : 'transparent', color: c.isActive ? 'var(--accent)' : 'var(--text-muted)', borderColor: c.isActive ? 'var(--accent)' : 'var(--border)' }}>
                  {c.isActive ? 'Active' : 'Ended'}
                </span>
              </button>
            ))
          )}
        </div>

        <div style={s.main}>
          {selected ? (
            <>
              <h2 style={s.convDetailTitle}>{selected.title}</h2>
              <div style={s.msgs}>
                {selected.messages.map((m, i) => (
                  <div key={i} style={{ ...s.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                    {m.role === 'assistant' && <span style={s.avatar}>🤖</span>}
                    <div style={{ ...s.bubble, ...(m.role === 'user' ? s.bubbleUser : s.bubbleBot) }}>
                      {m.content}
                      <div style={s.time}>{new Date(m.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={s.empty}>
              <span style={{ fontSize: 48 }}>💬</span>
              <p style={s.muted}>Select a conversation to view</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)' },
  logo: { fontFamily: 'var(--font-mono)', fontSize: 18, color: 'var(--accent)', fontWeight: 700 },
  backBtn: { fontSize: 13, color: 'var(--accent)', background: 'transparent', border: 'none' },
  content: { flex: 1, display: 'flex', overflow: 'hidden' },
  sidebar: { width: 300, borderRight: '1px solid var(--border)', overflowY: 'auto', padding: '1rem' },
  sideTitle: { fontSize: 14, fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 },
  convItem: { width: '100%', background: 'transparent', border: '1px solid transparent', borderRadius: 8, padding: '0.75rem', marginBottom: 6, textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s' },
  convItemActive: { background: 'var(--surface)', borderColor: 'var(--border)' },
  convTitle: { fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  convMeta: { fontSize: 11, color: 'var(--text-muted)' },
  badge: { display: 'inline-block', marginTop: 4, fontSize: 10, padding: '1px 6px', borderRadius: 4, border: '1px solid' },
  main: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  convDetailTitle: { padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 600 },
  msgs: { flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  avatar: { fontSize: 24 },
  bubble: { maxWidth: '70%', padding: '0.65rem 1rem', borderRadius: 14, fontSize: 13, lineHeight: 1.5 },
  bubbleUser: { background: 'var(--accent)', color: '#000', fontWeight: 500 },
  bubbleBot: { background: 'var(--surface)', border: '1px solid var(--border)' },
  time: { fontSize: 10, opacity: 0.5, marginTop: 4 },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 },
  muted: { color: 'var(--text-muted)', fontSize: 13 },
};
