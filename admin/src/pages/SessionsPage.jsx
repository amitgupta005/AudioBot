import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get('/admin/sessions')
      .then(({ data }) => { setSessions(data.sessions || []); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const endSession = async (sessionId) => {
    if (!confirm('Force-end this session?')) return;
    try {
      await api.delete(`/admin/sessions/${sessionId}`);
      toast.success('Session ended');
      load();
    } catch (e) { toast.error('Failed to end session'); }
  };

  const endUserSessions = async (userId, name) => {
    if (!confirm(`End all sessions for ${name}?`)) return;
    try {
      const { data } = await api.delete(`/admin/sessions/user/${userId}`);
      toast.success(`Ended ${data.count} session(s)`);
      load();
    } catch { toast.error('Failed'); }
  };

  const elapsed = (ts) => {
    const s = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  };

  return (
    <div style={s.page} className="fade-in">
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Live Sessions</h1>
          <p style={s.sub}>{sessions.length} active · auto-refreshes every 10s</p>
        </div>
        <button style={s.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={s.loading}>Loading sessions…</div>
      ) : sessions.length === 0 ? (
        <div style={s.empty}>
          <span style={{ fontSize: 40 }}>🔌</span>
          <p>No active sessions</p>
        </div>
      ) : (
        <div style={s.grid}>
          {sessions.map(session => (
            <div key={session.sessionId} style={s.card}>
              <div style={s.cardHeader}>
                <div style={s.dot} />
                <span style={s.sessionId}>{session.sessionId.slice(0, 8)}…</span>
                <span style={s.elapsed}>{elapsed(session.createdAt)}</span>
              </div>
              {session.user && (
                <div style={s.userInfo}>
                  <div style={s.avatar}>{session.user.name?.[0]?.toUpperCase()}</div>
                  <div>
                    <div style={s.userName}>{session.user.name}</div>
                    <div style={s.userEmail}>{session.user.email}</div>
                  </div>
                </div>
              )}
              <div style={s.stats}>
                <div style={s.stat}>
                  <span style={s.statVal}>{session.messageCount || 0}</span>
                  <span style={s.statLbl}>Messages</span>
                </div>
                <div style={s.stat}>
                  <span style={s.statVal}>{elapsed(session.lastActivity)}</span>
                  <span style={s.statLbl}>Last Active</span>
                </div>
              </div>
              <div style={s.actions}>
                <button style={s.endBtn} onClick={() => endSession(session.sessionId)}>
                  End Session
                </button>
                {session.user && (
                  <button style={s.endAllBtn} onClick={() => endUserSessions(session.userId, session.user?.name)}>
                    End All for User
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page: { padding: '2rem' },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem' },
  title: { fontSize: 22, fontWeight: 600 },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  refreshBtn: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.5rem 1rem', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  loading: { color: 'var(--text-muted)', padding: '2rem', textAlign: 'center' },
  empty: { textAlign: 'center', color: 'var(--text-muted)', padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' },
  dot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 6px var(--green)', flexShrink: 0 },
  sessionId: { fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', flex: 1 },
  elapsed: { fontSize: 11, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 6px', borderRadius: 4 },
  userInfo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem', padding: '0.75rem', background: 'var(--surface2)', borderRadius: 8 },
  avatar: { width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 },
  userName: { fontSize: 13, fontWeight: 500 },
  userEmail: { fontSize: 11, color: 'var(--text-muted)' },
  stats: { display: 'flex', gap: 0, marginBottom: '1rem', background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden' },
  stat: { flex: 1, padding: '0.65rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 2 },
  statVal: { fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text)' },
  statLbl: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 },
  actions: { display: 'flex', gap: 8 },
  endBtn: { flex: 1, background: 'rgba(255,95,95,0.1)', color: 'var(--red)', border: '1px solid rgba(255,95,95,0.25)', borderRadius: 8, padding: '0.55rem', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  endAllBtn: { flex: 1, background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.55rem', fontSize: 12, cursor: 'pointer' },
};
