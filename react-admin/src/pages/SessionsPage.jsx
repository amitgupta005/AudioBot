import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/api';

export default function SessionsPage() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getSessions();
      setSessions(data.sessions);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const handleTerminate = async (sessionId) => {
    if (!confirm('Terminate this session? The user will be disconnected.')) return;
    try {
      await adminApi.terminateSession(sessionId);
      toast.success('Session terminated');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const elapsed = (ts) => {
    const ms = Date.now() - new Date(ts);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <div className="page-title">Live Sessions</div>
          <div className="page-sub">{sessions.length} active — auto-refreshes every 10s</div>
        </div>
        <button onClick={load} style={{ padding: '9px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, textAlign: 'center', padding: 60 }}>Loading...</div>
      ) : sessions.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 80, color: 'rgba(255,255,255,0.2)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>◌</div>
          <div style={{ fontSize: 15 }}>No active sessions</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sessions.map((s) => (
            <div key={s.sessionId} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                {/* Pulse indicator */}
                <div style={{ position: 'relative', width: 10, height: 10 }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#22c55e', animation: 'ping 1.5s infinite' }} />
                  <div style={{ position: 'relative', width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontFamily: "'DM Mono', monospace", color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>
                    {s.sessionId.slice(0, 20)}...
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                    User: {s.userId} · Started {elapsed(s.createdAt)} ago · {s.messages?.length || 0} messages
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>
                  Last: {elapsed(s.lastActivity)} ago
                </div>
                <button
                  onClick={() => handleTerminate(s.sessionId)}
                  style={{ padding: '7px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 500 }}
                >
                  Terminate
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`@keyframes ping { 75%,100% { transform: scale(2); opacity: 0; } }`}</style>
    </div>
  );
}
