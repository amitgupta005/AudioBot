import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

const Badge = ({ status }) => {
  const map = {
    banned: ['badge badge-red', 'Banned'],
    active: ['badge badge-green', 'Active'],
    inactive: ['badge badge-muted', 'Inactive'],
    admin: ['badge badge-blue', 'Admin'],
  };
  const [cls, label] = map[status] || map.inactive;
  return <span className={cls}>{label}</span>;
};

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [showBanModal, setShowBanModal] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/admin/users', { params: { page, limit: 15, search, status } })
      .then(({ data }) => { setUsers(data.users); setTotal(data.total); })
      .finally(() => setLoading(false));
  }, [page, search, status]);

  useEffect(() => { load(); }, [load]);

  const handleBan = async () => {
    try {
      await api.patch(`/admin/users/${showBanModal._id}/ban`, { reason: banReason });
      toast.success('User banned');
      setShowBanModal(null);
      setBanReason('');
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };

  const handleUnban = async (id) => {
    if (!confirm('Unban this user?')) return;
    await api.patch(`/admin/users/${id}/unban`);
    toast.success('User unbanned');
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this user and ALL their data? This cannot be undone.')) return;
    await api.delete(`/admin/users/${id}`);
    toast.success('User deleted');
    setSelected(null);
    load();
  };

  const statusOf = (u) => u.role === 'admin' ? 'admin' : u.isBanned ? 'banned' : !u.isActive ? 'inactive' : 'active';

  return (
    <div style={s.page} className="fade-in">
      <div style={s.header}>
        <h1 style={s.title}>Users <span style={s.count}>{total}</span></h1>
        <div style={s.filters}>
          <input style={s.search} placeholder="Search name or email…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
          <select style={s.select} value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="banned">Banned</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={s.th}>User</th>
              <th style={s.th}>Role</th>
              <th style={s.th}>Status</th>
              <th style={s.th}>Joined</th>
              <th style={s.th}>Sessions</th>
              <th style={s.th}>Last Login</th>
              <th style={s.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={s.loadingCell}>Loading…</td></tr>
            ) : users.map(u => (
              <tr key={u._id} style={s.tr} onClick={() => setSelected(u)}>
                <td style={s.td}>
                  <div style={s.userCell}>
                    <div style={s.avatar}>{u.name?.[0]?.toUpperCase()}</div>
                    <div>
                      <div style={s.userName}>{u.name}</div>
                      <div style={s.userEmail}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={s.td}><Badge status={u.role === 'admin' ? 'admin' : 'active'} /></td>
                <td style={s.td}><Badge status={statusOf(u)} /></td>
                <td style={s.td}>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td style={s.td}>{u.totalSessions}</td>
                <td style={s.td}>{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : '—'}</td>
                <td style={s.td} onClick={e => e.stopPropagation()}>
                  <div style={s.actions}>
                    {u.isBanned
                      ? <button style={s.btnGreen} onClick={() => handleUnban(u._id)}>Unban</button>
                      : u.role !== 'admin' && <button style={s.btnRed} onClick={() => setShowBanModal(u)}>Ban</button>
                    }
                    {u.role !== 'admin' && (
                      <button style={s.btnDanger} onClick={() => handleDelete(u._id)}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={s.pager}>
        <button style={s.pageBtn} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
        <span style={s.pageInfo}>Page {page} of {Math.ceil(total / 15) || 1}</span>
        <button style={s.pageBtn} onClick={() => setPage(p => p + 1)} disabled={page * 15 >= total}>Next →</button>
      </div>

      {/* User detail panel */}
      {selected && (
        <div style={s.drawer}>
          <div style={s.drawerContent}>
            <div style={s.drawerHeader}>
              <h2 style={s.drawerTitle}>{selected.name}</h2>
              <button style={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div style={s.drawerBody}>
              <Row label="Email" value={selected.email} />
              <Row label="Role" value={selected.role} />
              <Row label="Status" value={statusOf(selected)} />
              <Row label="Total Sessions" value={selected.totalSessions} />
              <Row label="Total Messages" value={selected.totalMessages} />
              <Row label="Login Count" value={selected.loginCount} />
              <Row label="Joined" value={new Date(selected.createdAt).toLocaleString()} />
              {selected.isBanned && <Row label="Banned Reason" value={selected.bannedReason} color="var(--red)" />}
            </div>
          </div>
        </div>
      )}

      {/* Ban modal */}
      {showBanModal && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h2 style={s.modalTitle}>Ban {showBanModal.name}?</h2>
            <p style={s.modalSub}>This will end all active sessions immediately.</p>
            <textarea style={s.textarea} value={banReason} onChange={e => setBanReason(e.target.value)}
              placeholder="Reason for ban (optional)" rows={3} />
            <div style={s.modalBtns}>
              <button style={s.btnGhost} onClick={() => setShowBanModal(null)}>Cancel</button>
              <button style={s.btnRed} onClick={handleBan}>Confirm Ban</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const Row = ({ label, value, color }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>
    <span style={{ fontSize: 13, color: color || 'var(--text)', fontWeight: 500 }}>{String(value)}</span>
  </div>
);

const s = {
  page: { padding: '2rem' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 },
  title: { fontSize: 22, fontWeight: 600 },
  count: { fontSize: 14, color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 },
  filters: { display: 'flex', gap: 10 },
  search: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.9rem', color: 'var(--text)', fontSize: 13, width: 220 },
  select: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem 0.9rem', color: 'var(--text)', fontSize: 13 },
  tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: 'var(--surface2)' },
  th: { padding: '0.7rem 1rem', fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 },
  tr: { borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' },
  td: { padding: '0.75rem 1rem', fontSize: 13 },
  userCell: { display: 'flex', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-dim)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  userName: { fontWeight: 500 },
  userEmail: { fontSize: 11, color: 'var(--text-muted)' },
  actions: { display: 'flex', gap: 6 },
  btnRed: { fontSize: 12, background: 'rgba(255,95,95,0.12)', color: 'var(--red)', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(255,95,95,0.3)', cursor: 'pointer' },
  btnGreen: { fontSize: 12, background: 'rgba(34,212,123,0.12)', color: 'var(--green)', padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(34,212,123,0.3)', cursor: 'pointer' },
  btnDanger: { fontSize: 12, background: 'rgba(255,95,95,0.06)', color: 'var(--text-muted)', padding: '3px 10px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' },
  btnGhost: { fontSize: 13, background: 'var(--surface2)', color: 'var(--text)', padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' },
  loadingCell: { padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' },
  pager: { display: 'flex', alignItems: 'center', gap: 12, marginTop: '1rem', justifyContent: 'center' },
  pageBtn: { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0.4rem 0.9rem', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
  pageInfo: { fontSize: 12, color: 'var(--text-muted)' },
  drawer: { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' },
  drawerContent: { width: 360, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column' },
  drawerHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', borderBottom: '1px solid var(--border)' },
  drawerTitle: { fontSize: 16, fontWeight: 600 },
  closeBtn: { background: 'var(--surface2)', color: 'var(--text-muted)', width: 30, height: 30, borderRadius: 8, fontSize: 14 },
  drawerBody: { flex: 1, padding: '1.25rem', overflowY: 'auto' },
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modal: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2rem', width: 420, maxWidth: '90vw' },
  modalTitle: { fontSize: 18, fontWeight: 600, marginBottom: 8 },
  modalSub: { fontSize: 13, color: 'var(--text-muted)', marginBottom: '1.2rem' },
  textarea: { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem', color: 'var(--text)', fontSize: 13, resize: 'vertical', marginBottom: '1.2rem' },
  modalBtns: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
};
