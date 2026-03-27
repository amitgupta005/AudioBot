import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { authApi } from '../services/api';

export default function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', jobId: '' });
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuthStore();
  const navigate = useNavigate();

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const jobId = form.jobId.trim() || undefined;

      if (mode === 'register' && jobId) {
        try {
          await authApi.verifyJob(jobId);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Job ID is invalid or not found');
          setLoading(false);
          return;
        }
      }

      if (mode === 'login') {
        await login(form.email, form.password);
        toast.success('Welcome back!');
      } else {
        await register(form.name, form.email, form.password, jobId);
        toast.success('Account created!');
      }
      navigate('/chat');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #0a0a0f 0%, #0d1117 50%, #0a0f1a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .auth-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 48px; width: 420px; backdrop-filter: blur(20px); }
        .auth-title { font-family: 'Syne', sans-serif; font-size: 32px; font-weight: 800; background: linear-gradient(135deg, #e2e8f0, #7c9ae0); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
        .auth-sub { color: rgba(255,255,255,0.4); font-size: 14px; margin-bottom: 36px; }
        .field { margin-bottom: 16px; }
        .field label { display: block; color: rgba(255,255,255,0.6); font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
        .field input { width: 100%; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: #e2e8f0; font-size: 14px; font-family: 'DM Sans', sans-serif; transition: border-color 0.2s; outline: none; }
        .field input:focus { border-color: rgba(124,154,224,0.5); background: rgba(255,255,255,0.07); }
        .btn-primary { width: 100%; padding: 14px; background: linear-gradient(135deg, #3b6cf4, #5b8af4); border: none; border-radius: 10px; color: white; font-size: 15px; font-weight: 600; cursor: pointer; transition: opacity 0.2s, transform 0.15s; font-family: 'DM Sans', sans-serif; margin-top: 8px; }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .toggle { text-align: center; margin-top: 24px; color: rgba(255,255,255,0.4); font-size: 14px; }
        .toggle span { color: #7c9ae0; cursor: pointer; font-weight: 500; }
        .logo { width: 48px; height: 48px; background: linear-gradient(135deg, #3b6cf4, #7c9ae0); border-radius: 14px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px; font-size: 22px; }
      `}</style>
      <div className="auth-card">
        <div className="logo">🎙️</div>
        <div className="auth-title">AudioBot</div>
        <div className="auth-sub">{mode === 'login' ? 'Sign in to your account' : 'Create a new account'}</div>
        <form onSubmit={handle}>
          {mode === 'register' && (
            <>
              <div className="field">
                <label>Name</label>
                <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="field">
                <label>Job ID</label>
                <input placeholder="Paste job ID" value={form.jobId} onChange={(e) => setForm({ ...form, jobId: e.target.value })} />
                <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                  Provide the job ID you were invited to (optional).
                </div>
              </div>
            </>
          )}
          <div className="field">
            <label>Email</label>
            <input type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          </div>
          <button className="btn-primary" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
        <div className="toggle">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <span onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </span>
        </div>
      </div>
    </div>
  );
}
