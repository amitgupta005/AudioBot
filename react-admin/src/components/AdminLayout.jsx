import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import useAdminStore from '../store/adminStore';

const NAV = [
  { to: '/', icon: '▤', label: 'Dashboard', end: true },
  { to: '/users', icon: '◉', label: 'Users' },
  { to: '/conversations', icon: '◈', label: 'Conversations' },
  { to: '/sessions', icon: '◌', label: 'Live Sessions' },
  { to: '/config', icon: '⚙', label: 'System Config' },
];

export default function AdminLayout() {
  const { user, logout } = useAdminStore();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#080b11', fontFamily: "'Space Grotesk', sans-serif", color: '#e2e8f0' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sidebar { width: 240px; min-height: 100vh; background: rgba(255,255,255,0.02); border-right: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; flex-shrink: 0; }
        .sb-brand { padding: 28px 24px 20px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .sb-tag { font-size: 10px; color: #3b6cf4; letter-spacing: 0.15em; font-family: 'DM Mono', monospace; margin-bottom: 4px; }
        .sb-title { font-size: 18px; font-weight: 700; color: #f1f5f9; }
        .sb-nav { flex: 1; padding: 16px 12px; display: flex; flex-direction: column; gap: 2px; }
        .nav-link { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: rgba(255,255,255,0.4); font-size: 14px; font-weight: 500; text-decoration: none; transition: all 0.15s; }
        .nav-link:hover { color: rgba(255,255,255,0.75); background: rgba(255,255,255,0.04); }
        .nav-link.active { color: #e2e8f0; background: rgba(59,108,244,0.12); border: 1px solid rgba(59,108,244,0.2); }
        .nav-icon { font-size: 15px; width: 18px; text-align: center; }
        .sb-footer { padding: 16px 12px; border-top: 1px solid rgba(255,255,255,0.06); }
        .user-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
        .avatar { width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #3b6cf4, #7c9ae0); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
        .user-name { font-size: 13px; font-weight: 500; color: rgba(255,255,255,0.7); }
        .user-role { font-size: 11px; color: #3b6cf4; font-family: 'DM Mono', monospace; }
        .btn-logout { width: 100%; margin-top: 6px; padding: 9px; background: transparent; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: rgba(255,255,255,0.4); font-size: 13px; cursor: pointer; font-family: 'Space Grotesk', sans-serif; transition: all 0.2s; }
        .btn-logout:hover { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: #f87171; }
        .main-content { flex: 1; overflow: auto; }
        .page { padding: 36px; }
        .page-title { font-size: 26px; font-weight: 700; color: #f1f5f9; margin-bottom: 4px; }
        .page-sub { font-size: 14px; color: rgba(255,255,255,0.35); margin-bottom: 32px; }
      `}</style>

      {/* Sidebar */}
      <div className="sidebar">
        <div className="sb-brand">
          <div className="sb-tag">// admin panel</div>
          <div className="sb-title">🎙️ AudioBot</div>
        </div>
        <div className="sb-nav">
          {NAV.map(({ to, icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>
        <div className="sb-footer">
          <div className="user-row">
            <div className="avatar">{user?.name?.[0]?.toUpperCase()}</div>
            <div>
              <div className="user-name">{user?.name}</div>
              <div className="user-role">admin</div>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout}>Sign out</button>
        </div>
      </div>

      {/* Main content */}
      <div className="main-content">
        <Outlet />
      </div>
    </div>
  );
}
