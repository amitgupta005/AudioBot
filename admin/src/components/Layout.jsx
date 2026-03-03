import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import useAdminAuth from '../store/authStore';

const nav = [
  { to: '/dashboard', icon: '⬡', label: 'Dashboard' },
  { to: '/users', icon: '👥', label: 'Users' },
  { to: '/conversations', icon: '💬', label: 'Conversations' },
  { to: '/sessions', icon: '🔌', label: 'Live Sessions' },
  { to: '/config', icon: '⚙️', label: 'AI Config' },
];

export default function Layout() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={s.root}>
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <span style={s.brandIcon}>🤖</span>
          <div>
            <div style={s.brandName}>AudioBot</div>
            <div style={s.brandSub}>Admin Panel</div>
          </div>
        </div>

        <nav style={s.nav}>
          {nav.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({ ...s.navItem, ...(isActive ? s.navItemActive : {}) })}>
              <span style={s.navIcon}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        <div style={s.userArea}>
          <div style={s.userInfo}>
            <div style={s.userName}>{user?.name}</div>
            <div style={s.userEmail}>{user?.email}</div>
          </div>
          <button style={s.logoutBtn} onClick={handleLogout}>↩</button>
        </div>
      </aside>

      <main style={s.main}>
        <Outlet />
      </main>
    </div>
  );
}

const s = {
  root: { height: '100vh', display: 'flex', overflow: 'hidden' },
  sidebar: {
    width: 'var(--sidebar-w)', background: 'var(--surface)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, padding: '1.5rem 1.25rem', borderBottom: '1px solid var(--border)' },
  brandIcon: { fontSize: 28 },
  brandName: { fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--accent)', fontWeight: 700 },
  brandSub: { fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 },
  nav: { flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: 2 },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '0.6rem 0.75rem',
    borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', transition: 'all 0.15s',
  },
  navItemActive: { background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 600 },
  navIcon: { fontSize: 16, width: 20, textAlign: 'center' },
  userArea: {
    padding: '1rem', borderTop: '1px solid var(--border)', display: 'flex',
    alignItems: 'center', gap: 10,
  },
  userInfo: { flex: 1, overflow: 'hidden' },
  userName: { fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  userEmail: { fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  logoutBtn: { background: 'var(--surface2)', color: 'var(--text-muted)', width: 32, height: 32, borderRadius: 8, fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  main: { flex: 1, overflow: 'auto', background: 'var(--bg)' },
};
