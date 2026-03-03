import { Routes, Route, Navigate } from 'react-router-dom';
import useAdminAuth from './store/authStore';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import UsersPage from './pages/UsersPage';
import ConversationsPage from './pages/ConversationsPage';
import SessionsPage from './pages/SessionsPage';
import ConfigPage from './pages/ConfigPage';

const Protected = ({ children }) => {
  const { user } = useAdminAuth();
  if (!user || user.role !== 'admin') return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><Layout /></Protected>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="sessions" element={<SessionsPage />} />
        <Route path="config" element={<ConfigPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
