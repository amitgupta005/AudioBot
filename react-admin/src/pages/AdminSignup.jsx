import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAdminStore from '../store/adminStore';

export default function AdminSignup() {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const { register } = useAdminStore();
  const navigate = useNavigate();

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#080b11', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', 'Courier New', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .login-wrap { width: 400px; }
        .login-tag { font-size: 11px; color: #3b6cf4; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 24px; font-family: 'DM Mono', monospace; }
        .login-title { font-family: 'Space Grotesk', sans-serif; font-size: 36px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; }
        .login-sub { color: rgba(255,255,255,0.3); font-size: 14px; margin-bottom: 40px; font-family: 'Space Grotesk', sans-serif; }
        .field { margin-bottom: 20px; }
        .field label { display: block; color: rgba(255,255,255,0.4); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
        .field input { width: 100%; padding: 13px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #e2e8f0; font-size: 14px; font-family: 'DM Mono', monospace; outline: none; transition: border-color 0.2s; }
        .field input:focus { border-color: rgba(59,108,244,0.5); background: rgba(59,108,244,0.04); }
        .btn { width: 100%; padding: 14px; background: #3b6cf4; border: none; border-radius: 8px; color: white; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'Space Grotesk', sans-serif; letter-spacing: 0.02em; transition: all 0.2s; margin-top: 8px; }
        .btn:hover:not(:disabled) { background: #4a78f7; transform: translateY(-1px); }
        .btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .hint { margin-top: 20px; padding: 14px; background: rgba(59,108,244,0.06); border: 1px solid rgba(59,108,244,0.15); border-radius: 8px; font-size: 12px; color: rgba(255,255,255,0.3); line-height: 1.6; }
        .hint a { color: rgba(255,255,255,0.8); text-decoration: underline; }
      `}</style>
      <div className="login-wrap">
        <div className="login-tag">// AudioBot Administration</div>
        <div className="login-title">Company Signup</div>
        <div className="login-sub">Create a company account to manage your jobs and conversations.</div>
        <form onSubmit={handle}>
          <div className="field">
            <label>Company Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Inc" required />
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="hello@company.com" required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" required />
          </div>
          <button className="btn" disabled={loading}>{loading ? 'Creating account...' : 'Sign up & enter panel →'}</button>
        </form>
        <div className="hint">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
