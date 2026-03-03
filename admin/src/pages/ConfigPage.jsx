import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';

const CONFIG_META = {
  system_prompt: { label: 'System Prompt', type: 'textarea', description: 'Sent to the Groq LLM for every conversation.' },
  ai_greeting: { label: 'AI Greeting', type: 'text', description: 'First message shown when a user starts a session.' },
  groq_model: { label: 'Groq Model', type: 'text', description: 'Model identifier (e.g. qwen-qwq-32b).' },
  max_session_messages: { label: 'Max Session Messages', type: 'number', description: 'Messages before auto-ending a session.' },
  session_ttl_seconds: { label: 'Session TTL (seconds)', type: 'number', description: 'How long Redis keeps a session alive.' },
  registration_enabled: { label: 'Registration Enabled', type: 'boolean', description: 'Allow new users to register.' },
};

export default function ConfigPage() {
  const [configs, setConfigs] = useState({});
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/config').then(({ data }) => {
      const map = {};
      data.configs.forEach(c => { map[c.key] = c; });
      setConfigs(map);
      setLoading(false);
    });
  }, []);

  const handleEdit = (key, val) => {
    setEditing(e => ({ ...e, [key]: val }));
  };

  const handleSave = async (key) => {
    setSaving(s => ({ ...s, [key]: true }));
    try {
      let value = editing[key] !== undefined ? editing[key] : configs[key]?.value;
      const meta = CONFIG_META[key];
      if (meta?.type === 'number') value = Number(value);
      if (meta?.type === 'boolean') value = value === 'true' || value === true;

      const { data } = await api.put(`/admin/config/${key}`, { value });
      setConfigs(c => ({ ...c, [key]: data.config }));
      setEditing(e => { const n = { ...e }; delete n[key]; return n; });
      toast.success(`${CONFIG_META[key]?.label || key} saved`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  if (loading) return <div style={s.loading}>Loading configuration…</div>;

  return (
    <div style={s.page} className="fade-in">
      <div style={s.header}>
        <h1 style={s.title}>AI Configuration</h1>
        <p style={s.sub}>Changes take effect immediately for new conversations</p>
      </div>

      <div style={s.grid}>
        {Object.entries(CONFIG_META).map(([key, meta]) => {
          const config = configs[key];
          const currentVal = editing[key] !== undefined ? editing[key] : config?.value;
          const isDirty = editing[key] !== undefined;
          const updatedBy = config?.updatedBy;

          return (
            <div key={key} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <div style={s.keyLabel}>{meta.label}</div>
                  <div style={s.keyName}>{key}</div>
                </div>
                {isDirty && (
                  <span className="badge badge-yellow">Unsaved</span>
                )}
              </div>

              <p style={s.description}>{meta.description}</p>

              {meta.type === 'textarea' ? (
                <textarea
                  style={s.textarea}
                  value={String(currentVal ?? '')}
                  onChange={e => handleEdit(key, e.target.value)}
                  rows={5}
                />
              ) : meta.type === 'boolean' ? (
                <div style={s.toggleRow}>
                  {['true', 'false'].map(opt => (
                    <button key={opt} style={{ ...s.toggleBtn, ...(String(currentVal) === opt ? s.toggleBtnActive : {}) }}
                      onClick={() => handleEdit(key, opt)}>
                      {opt === 'true' ? '✓ Enabled' : '✗ Disabled'}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  style={s.input}
                  type={meta.type}
                  value={String(currentVal ?? '')}
                  onChange={e => handleEdit(key, e.target.value)}
                />
              )}

              <div style={s.cardFooter}>
                {updatedBy && (
                  <span style={s.updatedBy}>Last updated by {updatedBy.name}</span>
                )}
                <button
                  style={{ ...s.saveBtn, opacity: saving[key] ? 0.6 : 1 }}
                  onClick={() => handleSave(key)}
                  disabled={saving[key]}
                >
                  {saving[key] ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const s = {
  page: { padding: '2rem' },
  header: { marginBottom: '1.75rem' },
  title: { fontSize: 22, fontWeight: 600 },
  sub: { fontSize: 13, color: 'var(--text-muted)', marginTop: 4 },
  loading: { padding: '2rem', color: 'var(--text-muted)' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 },
  card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: 12 },
  cardHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  keyLabel: { fontSize: 15, fontWeight: 600 },
  keyName: { fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 },
  description: { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 },
  input: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.65rem 0.9rem', color: 'var(--text)', fontSize: 13 },
  textarea: { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0.65rem 0.9rem', color: 'var(--text)', fontSize: 13, resize: 'vertical', lineHeight: 1.6 },
  toggleRow: { display: 'flex', gap: 8 },
  toggleBtn: { flex: 1, padding: '0.55rem', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' },
  toggleBtnActive: { background: 'var(--accent-dim)', borderColor: 'var(--accent)', color: 'var(--accent)' },
  cardFooter: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  updatedBy: { fontSize: 11, color: 'var(--text-muted)' },
  saveBtn: { background: 'var(--accent)', color: '#fff', fontWeight: 600, padding: '0.5rem 1.2rem', borderRadius: 8, fontSize: 13, cursor: 'pointer' },
};
