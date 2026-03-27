import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAdminStore from './store/adminStore';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import AdminSignup from './pages/AdminSignup';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import JobsPage from './pages/JobsPage';
import ConversationsPage from './pages/ConversationsPage';
import SessionsPage from './pages/SessionsPage';
import ConfigPage from './pages/ConfigPage';

function Guard({ children }) {
  const { isAuthenticated, isLoading } = useAdminStore();
  if (isLoading) return <div style={{ minHeight: '100vh', background: '#080b11', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: "'DM Mono', monospace" }}>// authenticating...</div>;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RoleGuard({ children, allowedRoles }) {
  const { isAuthenticated, isLoading, user } = useAdminStore();
  if (isLoading) return <div style={{ minHeight: '100vh', background: '#080b11', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: "'DM Mono', monospace" }}>// authenticating...</div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user?.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { init, user } = useAdminStore();
  useEffect(() => { init(); }, []);

  const getIndexElement = () => {
    if (user?.role === 'admin') return <RoleGuard allowedRoles={['admin']}><Dashboard /></RoleGuard>;
    if (user?.role === 'company') return <RoleGuard allowedRoles={['company']}><JobsPage /></RoleGuard>;
    return <RoleGuard allowedRoles={['admin']}><Dashboard /></RoleGuard>; // fallback
  };

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background: 'rgba(15,20,32,0.95)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', fontFamily: "'Space Grotesk', sans-serif" } }} />
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/signup" element={<AdminSignup />} />
        <Route path="/" element={<Guard><AdminLayout /></Guard>}>
          <Route index element={getIndexElement()} />
          <Route path="users" element={<RoleGuard allowedRoles={['admin']}><UsersPage /></RoleGuard>} />
          <Route path="jobs" element={<RoleGuard allowedRoles={['admin', 'company']}><JobsPage /></RoleGuard>} />
          <Route path="conversations" element={<RoleGuard allowedRoles={['admin', 'company']}><ConversationsPage /></RoleGuard>} />
          <Route path="sessions" element={<RoleGuard allowedRoles={['admin']}><SessionsPage /></RoleGuard>} />
          <Route path="config" element={<RoleGuard allowedRoles={['admin']}><ConfigPage /></RoleGuard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
