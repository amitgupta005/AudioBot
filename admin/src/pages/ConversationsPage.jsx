import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/conversations', { params: { page, limit: 20, active: activeFilter || undefined } })
      .then(({ data }) => { setConversations(data.conversations || []); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [page, activeFilter]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (sessionId) => {
    const { data } = await api.get(`/admin/conversations/${sessionId}`);
    setSelected(data.conversation);
  };

  return (
    <div style={s.page} className="fade-in">
      <div style={s.header}>
        <h1 style={s.title}>Conversations <span style={s.count}>{total}</span></h1>
        <div style={s.filters}>
          {[['', 'All'], ['true', 'Active'], ['false', 'Ended']].map(([val, label]) => (
            <button key={val} style={{ ...s.filterBtn, ...(activeFilter === val ? s.filterBtnActive : {}) }}
              onClick={() => { setActiveFilter(val); setPage(1); }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={s.layout}>
        <div style={s.list}>
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr style={s.thead}>
                  <th style={s.th}>Title</th>
                  <th style={s.th}>User</th>
                  <th style={s.th}>Messages</th>
                  <th style={s.th}>Status</th>
                  <th style={s.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} style={s.loadingCell}>Loading…</td></tr>
                ) : conversations.map(c => (
                  <tr key={c._id} style={{ ...s.tr, ...(selected?.sessionId === c.sessionId ? s.trActive : {}) }}
                    onClick={() => loadDetail(c.sessionId)}>
                    <td style={s.td}>
                      <div style={s.convTitle}>{c.title || 'Untitled'}</div>
                    </td>
                    <td style={s.td}>
                      {c.userId ? (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500 }}>{c.userId.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.userId.email}</div>
                        </div>
                      ) : '—'}
                    </td>
                    <td style={s.td}>{c.messageCount}</td>
                    <td style={s.td}>
                      <span className={`badge ${c.isActive ? 'badge-green' : 'badge-muted'}`}>
                        {c.isActive ? 'Active' : 'Ended'}
                      </span>
                    </td>
                    <td style={s.td}>{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={s.pager}>
            <button style={s.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
            <span style={s.pageInfo}>Page {page}</span>
            <button style={s.pageBtn} onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total}>Next →</button>
          </div>
        </div>

        {selected && (
          <div style={s.detail}>
            <div style={s.detailHeader}>
              <div>
                <div style={s.detailTitle}>{selected.title}</div>
                <div style={s.detailMeta}>{selected.messageCount} messages · {selected.userId?.name}</div>
              </div>
              <button style={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={s.messages}>
              {selected.messages?.map((m, i) => (
                <div key={i} style={{ ...s.msgRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {m.role === 'assistant' && <span style={{ fontSize: 18 }}>🤖</span>}
                  <div style={{ ...s.bubble, ...(m.role === 'user' ? s.bubbleUser : s.bubbleBot) }}>
                    {m.content}
                    <div style={s.time}>{new Date(m.timestamp).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page: { padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' },
  title: { fontSize: 22, fontWeight: 600 },
  count: { fontSize: 14, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 },
  filters: { display: 'flex', gap: 6 },
  filterBtn: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '0.4rem 0.9rem', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  filterBtnActive: { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent)' },
  layout: { flex: 1, display: 'flex', gap: 16, overflow: 'hidden' },
  list: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto', flex: 1 },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--surface2)' },
  th: { padding: '0.65rem 1rem', fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' },
  tr: { borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' },
  trActive: { background: 'var(--accent-dim)' },
  td: { padding: '0.7rem 1rem', fontSize: 12 },
  convTitle: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 },
  loadingCell: { padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' },
  pager: { display: 'flex', alignItems: 'center', gap: 12, marginTop: '0.75rem', justifyContent: 'center' },
  pageBtn: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.9rem', borderRadius: 8, fontSize: 12, cursor: 'pointer' },
  pageInfo: { fontSize: 12, color: 'var(--text-muted)' },
  detail: { width: 380, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 },
  detailHeader: { padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  detailTitle: { fontSize: 14, fontWeight: 600, marginBottom: 3 },
  detailMeta: { fontSize: 11, color: 'var(--text-muted)' },
  closeBtn: { background: 'var(--surface2)', color: 'var(--text-muted)', width: 28, height: 28, borderRadius: 6, fontSize: 13, flexShrink: 0 },
  messages: { flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 6 },
  bubble: { maxWidth: '80%', padding: '0.5rem 0.8rem', borderRadius: 12, fontSize: 12, lineHeight: 1.5 },
  bubbleUser: { background: 'var(--accent)', color: '#fff', fontWeight: 500 },
  bubbleBot: { background: 'var(--surface2)', border: '1px solid var(--border)' },
  time: { fontSize: 9, opacity: 0.5, marginTop: 3 },
};
