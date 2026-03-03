import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');

    const result = await register(form.name, form.email, form.password);
    if (result.success) {
      toast.success('Account created!');
      navigate('/chat');
    } else {
      toast.error(result.message);
    }
  };

  const field = (key, type, placeholder) => (
    <div style={styles.field}>
      <label style={styles.label}>{key.charAt(0).toUpperCase() + key.slice(1)}</label>
      <input
        style={styles.input}
        type={type}
        value={form[key]}
        onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        required
      />
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🤖</span>
          <h1 style={styles.logoText}>AudioBot</h1>
          <p style={styles.subtitle}>Create your account</p>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          {field('name', 'text', 'Your name')}
          {field('email', 'email', 'you@example.com')}
          {field('password', 'password', '••••••••')}
          <div style={styles.field}>
            <label style={styles.label}>Confirm Password</label>
            <input
              style={styles.input}
              type="password"
              value={form.confirm}
              onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              placeholder="••••••••"
              required
            />
          </div>
          <button style={{ ...styles.btn, opacity: isLoading ? 0.7 : 1 }} type="submit" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Account'}
          </button>
        </form>
        <p style={styles.footer}>
          Already have one? <Link to="/login" style={styles.link}>Sign in</Link>
        </p>
      </div>
      <div style={styles.grid} />
    </div>
  );
}

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', position: 'relative', overflow: 'hidden' },
  grid: { position: 'absolute', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '48px 48px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)' },
  card: { position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '2.5rem', boxShadow: '0 0 60px rgba(0,255,136,0.05)' },
  logo: { textAlign: 'center', marginBottom: '2rem' },
  logoIcon: { fontSize: 48, display: 'block', marginBottom: 8 },
  logoText: { fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--accent)', letterSpacing: 2 },
  subtitle: { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 },
  form: { display: 'flex', flexDirection: 'column', gap: '1.2rem' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 },
  input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.75rem 1rem', color: 'var(--text)', fontSize: 14 },
  btn: { marginTop: 8, background: 'var(--accent)', color: '#000', fontWeight: 700, padding: '0.85rem', borderRadius: 8, fontSize: 14, letterSpacing: 0.5, fontFamily: 'var(--font-mono)' },
  footer: { textAlign: 'center', marginTop: '1.5rem', fontSize: 13, color: 'var(--text-muted)' },
  link: { color: 'var(--accent)', fontWeight: 600 },
};
