import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/api';

function ConversationModal({ sessionId, onClose }) {
  const [convo, setConvo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.getConversation(sessionId).then(({ data }) => {
      setConvo(data.conversation); setLoading(false);
    }).catch(() => setLoading(false));
  }, [sessionId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
      <div style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: 600, maxHeight: '80vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{convo?.title || 'Conversation'}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace" }}>
              {convo?.userId?.email} · {convo?.messageCount} messages
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>
        {loading ? <div style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 40 }}>Loading...</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {convo?.messages?.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, flexDirection: m.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: m.role === 'assistant' ? 'linear-gradient(135deg, #3b6cf4, #7c9ae0)' : 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0 }}>
                  {m.role === 'assistant' ? '🤖' : '👤'}
                </div>
                <div style={{ padding: '10px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6, background: m.role === 'assistant' ? 'rgba(255,255,255,0.05)' : 'rgba(59,108,244,0.15)', border: `1px solid ${m.role === 'assistant' ? 'rgba(255,255,255,0.07)' : 'rgba(59,108,244,0.25)'}`, maxWidth: '80%' }}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConversationsPage() {
  const [convos, setConvos] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter === 'active') params.isActive = 'true';
      if (filter === 'ended') params.isActive = 'false';
      const { data } = await adminApi.getConversations(params);
      setConvos(data.conversations); setTotal(data.total);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, filter]);

  const handleEnd = async (sessionId) => {
    if (!confirm('Force-end this session?')) return;
    try { await adminApi.endConversation(sessionId); toast.success('Session ended'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="page">
      {selected && <ConversationModal sessionId={selected} onClose={() => setSelected(null)} />}
      <div className="page-title">Conversations</div>
      <div className="page-sub">{total} total conversations</div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 24 }}>
        {['all', 'active', 'ended'].map((f) => (
          <button key={f} onClick={() => { setFilter(f); setPage(1); }} style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${filter === f ? 'rgba(59,108,244,0.4)' : 'rgba(255,255,255,0.08)'}`, background: filter === f ? 'rgba(59,108,244,0.12)' : 'transparent', color: filter === f ? '#7c9ae0' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', textTransform: 'capitalize' }}>{f}</button>
        ))}
      </div>

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['Title', 'User', 'Messages', 'Status', 'Updated', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", fontWeight: 400 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Loading...</td></tr>
            ) : convos.map((c) => (
              <tr key={c._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', cursor: 'pointer' }} onClick={() => setSelected(c.sessionId)}>
                <td style={{ padding: '14px 20px', fontSize: 13, color: '#e2e8f0', maxWidth: 200 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{c.userId?.email || '—'}</td>
                <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{c.messageCount}</td>
                <td style={{ padding: '14px 20px' }}>
                  <span style={{ background: c.isActive ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', color: c.isActive ? '#4ade80' : 'rgba(255,255,255,0.3)', border: `1px solid ${c.isActive ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}`, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                    {c.isActive ? 'active' : c.endedBy || 'ended'}
                  </span>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Mono', monospace" }}>{new Date(c.updatedAt).toLocaleString()}</td>
                <td style={{ padding: '14px 20px' }} onClick={(e) => e.stopPropagation()}>
                  {c.isActive && (
                    <button onClick={() => handleEnd(c.sessionId)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#f87171', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>
                      End
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        {[...Array(Math.ceil(total / 20))].slice(0, 10).map((_, i) => (
          <button key={i} onClick={() => setPage(i + 1)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${page === i + 1 ? 'rgba(59,108,244,0.5)' : 'rgba(255,255,255,0.08)'}`, background: page === i + 1 ? 'rgba(59,108,244,0.15)' : 'transparent', color: page === i + 1 ? '#7c9ae0' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>{i + 1}</button>
        ))}
      </div>
    </div>
  );
}
