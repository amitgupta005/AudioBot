import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/api';

const Badge = ({ role, banned }) => {
  if (banned) return <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>banned</span>;
  if (role === 'admin') return <span style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.25)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>admin</span>;
  return <span style={{ background: 'rgba(34,197,94,0.1)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.2)', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>user</span>;
};

function BanModal({ user, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try { await adminApi.banUser(user._id, reason); toast.success(`${user.name} banned`); onDone(); onClose(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setLoading(false); }
  };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: 420 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Ban {user.name}?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>This will terminate all their active sessions immediately.</div>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" style={{ width: '100%', padding: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e2e8f0', fontSize: 14, resize: 'none', height: 80, fontFamily: 'inherit', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handle} disabled={loading} style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#f87171', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            {loading ? 'Banning...' : 'Confirm Ban'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [banTarget, setBanTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getUsers({ page, limit: 20, search: search || undefined });
      setUsers(data.users); setTotal(data.total);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, search]);

  const handleUnban = async (id, name) => {
    if (!confirm(`Unban ${name}?`)) return;
    try { await adminApi.unbanUser(id); toast.success('User unbanned'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Permanently delete ${name}? This cannot be undone.`)) return;
    try { await adminApi.deleteUser(id); toast.success('User deleted'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  return (
    <div className="page">
      {banTarget && <BanModal user={banTarget} onClose={() => setBanTarget(null)} onDone={load} />}
      <div className="page-title">Users</div>
      <div className="page-sub">{total} registered users</div>

      <input
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        placeholder="Search by name or email..."
        style={{ width: '100%', maxWidth: 400, padding: '11px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 24 }}
      />

      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {['User', 'Email', 'Status', 'Conversations', 'Joined', 'Actions'].map((h) => (
                <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", fontWeight: 400 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Loading...</td></tr>
            ) : users.map((u) => (
              <tr key={u._id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: u.isBanned ? 'rgba(239,68,68,0.2)' : 'linear-gradient(135deg, #3b6cf4, #7c9ae0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{u.name[0]?.toUpperCase()}</div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: u.isBanned ? 'rgba(255,255,255,0.35)' : '#e2e8f0' }}>{u.name}</span>
                  </div>
                </td>
                <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{u.email}</td>
                <td style={{ padding: '14px 20px' }}><Badge role={u.role} banned={u.isBanned} /></td>
                <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{u.totalConversations}</td>
                <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.35)', fontFamily: "'DM Mono', monospace" }}>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '14px 20px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {u.isBanned ? (
                      <button onClick={() => handleUnban(u._id, u.name)} style={actionBtn('#22c55e')}>Unban</button>
                    ) : u.role !== 'admin' ? (
                      <button onClick={() => setBanTarget(u)} style={actionBtn('#ef4444')}>Ban</button>
                    ) : null}
                    {u.role !== 'admin' && (
                      <button onClick={() => handleDelete(u._id, u.name)} style={actionBtn('#6b7280')}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
        {[...Array(Math.ceil(total / 20))].map((_, i) => (
          <button key={i} onClick={() => setPage(i + 1)} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${page === i + 1 ? 'rgba(59,108,244,0.5)' : 'rgba(255,255,255,0.08)'}`, background: page === i + 1 ? 'rgba(59,108,244,0.15)' : 'transparent', color: page === i + 1 ? '#7c9ae0' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>{i + 1}</button>
        ))}
      </div>
    </div>
  );
}

const actionBtn = (color) => ({
  padding: '5px 12px', borderRadius: 6, border: `1px solid ${color}30`, background: `${color}15`, color, cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', fontWeight: 500, transition: 'opacity 0.15s'
});
