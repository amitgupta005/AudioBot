import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [form, setForm] = useState({ email: '', password: '' });
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const result = await login(form.email, form.password);
    if (result.success) {
      toast.success('Welcome back!');
      navigate('/chat');
    } else {
      toast.error(result.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🤖</span>
          <h1 style={styles.logoText}>AudioBot</h1>
          <p style={styles.subtitle}>Voice-first AI Assistant</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Email</label>
            <input
              style={styles.input}
              type="email"
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Password</label>
            <input
              style={styles.input}
              type="password"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </div>
          <button style={{ ...styles.btn, opacity: isLoading ? 0.7 : 1 }} type="submit" disabled={isLoading}>
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p style={styles.footer}>
          No account?{' '}
          <Link to="/register" style={styles.link}>Create one</Link>
        </p>
      </div>

      {/* Background grid */}
      <div style={styles.grid} />
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'var(--bg)', position: 'relative', overflow: 'hidden',
  },
  grid: {
    position: 'absolute', inset: 0, zIndex: 0,
    backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
    backgroundSize: '48px 48px',
    maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
  },
  card: {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 420,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius)', padding: '2.5rem',
    boxShadow: '0 0 60px rgba(0,255,136,0.05)',
  },
  logo: { textAlign: 'center', marginBottom: '2rem' },
  logoIcon: { fontSize: 48, display: 'block', marginBottom: 8 },
  logoText: { fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--accent)', letterSpacing: 2 },
  subtitle: { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: '1.2rem' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 },
  input: {
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
    padding: '0.75rem 1rem', color: 'var(--text)', fontSize: 14,
    transition: 'border-color 0.2s',
  },
  btn: {
    marginTop: 8, background: 'var(--accent)', color: '#000', fontWeight: 700,
    padding: '0.85rem', borderRadius: 8, fontSize: 14, letterSpacing: 0.5,
    transition: 'transform 0.15s, box-shadow 0.15s',
    fontFamily: 'var(--font-mono)',
  },
  footer: { textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: 'var(--text-muted)' },
  link: { color: 'var(--accent)', fontWeight: 600 },
};
