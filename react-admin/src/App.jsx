import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAdminStore from './store/adminStore';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './pages/AdminLogin';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import ConversationsPage from './pages/ConversationsPage';
import SessionsPage from './pages/SessionsPage';
import ConfigPage from './pages/ConfigPage';

function Guard({ children }) {
  const { isAuthenticated, isLoading } = useAdminStore();
  if (isLoading) return <div style={{ minHeight: '100vh', background: '#080b11', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13, fontFamily: "'DM Mono', monospace" }}>// authenticating...</div>;
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { init } = useAdminStore();
  useEffect(() => { init(); }, []);

  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ style: { background: 'rgba(15,20,32,0.95)', color: '#e2e8f0', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(20px)', fontFamily: "'Space Grotesk', sans-serif" } }} />
      <Routes>
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/" element={<Guard><AdminLayout /></Guard>}>
          <Route index element={<Dashboard />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="conversations" element={<ConversationsPage />} />
          <Route path="sessions" element={<SessionsPage />} />
          <Route path="config" element={<ConfigPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
