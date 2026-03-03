import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAdminAuth from '../store/authStore';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const { login, isLoading } = useAdminAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(form.email, form.password);
    if (result.success) navigate('/dashboard');
    else toast.error(result.message);
  };

  return (
    <div style={s.container}>
      <div style={s.card}>
        <div style={s.header}>
          <span style={{ fontSize: 44 }}>🛡️</span>
          <h1 style={s.title}>Admin Portal</h1>
          <p style={s.sub}>AudioBot Control Panel</p>
        </div>
        <form onSubmit={handleSubmit} style={s.form}>
          <div style={s.field}>
            <label style={s.label}>Email</label>
            <input style={s.input} type="email" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="admin@audiobot.com" required autoFocus />
          </div>
          <div style={s.field}>
            <label style={s.label}>Password</label>
            <input style={s.input} type="password" value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="••••••••" required />
          </div>
          <button style={{ ...s.btn, opacity: isLoading ? 0.6 : 1 }} disabled={isLoading}>
            {isLoading ? 'Authenticating…' : 'Sign In as Admin'}
          </button>
        </form>
      </div>
      <div style={s.grid} />
    </div>
  );
}

const s = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', position: 'relative' },
  grid: { position: 'absolute', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 70%)' },
  card: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 400, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2.5rem', boxShadow: '0 0 60px rgba(79,141,255,0.07)' },
  header: { textAlign: 'center', marginBottom: '2rem' },
  title: { fontFamily: 'var(--font-mono)', fontSize: 24, color: 'var(--accent)', marginTop: 8 },
  sub: { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: '1.2rem' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 },
  input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.7rem 1rem', color: 'var(--text)', fontSize: 14 },
  btn: { background: 'var(--accent)', color: '#fff', fontWeight: 700, padding: '0.85rem', borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-mono)', letterSpacing: 0.5 },
};
