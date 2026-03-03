import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi } from '../services/api';

const CONFIG_META = {
  'ai.systemPrompt': { label: 'AI System Prompt', type: 'textarea', description: 'Defines AI personality and behavior. Sent to FastAPI on each session.' },
  'ai.greeting': { label: 'Greeting Message', type: 'text', description: 'First message displayed when user starts a new session.' },
  'ai.model': { label: 'Groq Model', type: 'text', description: 'Model identifier passed to FastAPI (e.g. qwen-qwq-32b).' },
  'session.maxDurationMinutes': { label: 'Session Timeout (minutes)', type: 'number', description: 'Sessions idle longer than this are auto-ended.' },
  'session.maxMessages': { label: 'Max Messages Per Session', type: 'number', description: 'Hard limit on messages per conversation.' },
  'registration.enabled': { label: 'Allow New Registrations', type: 'boolean', description: 'Toggle to disable new user signups.' },
};

export default function ConfigPage() {
  const [configs, setConfigs] = useState({});
  const [draft, setDraft] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.getConfig();
      const map = {};
      data.configs.forEach((c) => { map[c.key] = c.value; });
      setConfigs(map);
      setDraft(JSON.parse(JSON.stringify(map)));
      setDirty(false);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const update = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminApi.updateConfig(draft);
      setConfigs({ ...draft });
      setDirty(false);
      toast.success('Configuration saved');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const renderInput = (key, meta) => {
    const val = draft[key] ?? '';
    if (meta.type === 'textarea') {
      return (
        <textarea
          value={val}
          onChange={(e) => update(key, e.target.value)}
          style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, fontFamily: "'DM Mono', monospace", resize: 'vertical', minHeight: 100, outline: 'none', lineHeight: 1.7 }}
        />
      );
    }
    if (meta.type === 'boolean') {
      return (
        <div
          onClick={() => update(key, !val)}
          style={{ width: 44, height: 24, borderRadius: 12, background: val ? '#3b6cf4' : 'rgba(255,255,255,0.1)', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          <div style={{ position: 'absolute', top: 2, left: val ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
        </div>
      );
    }
    if (meta.type === 'number') {
      return (
        <input
          type="number"
          value={val}
          onChange={(e) => update(key, Number(e.target.value))}
          style={{ width: 160, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, color: '#e2e8f0', fontSize: 14, fontFamily: "'DM Mono', monospace", outline: 'none' }}
        />
      );
    }
    return (
      <input
        value={val}
        onChange={(e) => update(key, e.target.value)}
        style={{ width: '100%', maxWidth: 500, padding: '10px 14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 8, color: '#e2e8f0', fontSize: 13, fontFamily: "'DM Mono', monospace", outline: 'none' }}
      />
    );
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32 }}>
        <div>
          <div className="page-title">System Config</div>
          <div className="page-sub">Changes take effect immediately. FastAPI is auto-notified.</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {dirty && <button onClick={load} style={{ padding: '9px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Discard</button>}
          <button onClick={save} disabled={!dirty || saving} style={{ padding: '9px 20px', background: dirty ? 'linear-gradient(135deg, #3b6cf4, #5b8af4)' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, color: dirty ? 'white' : 'rgba(255,255,255,0.25)', cursor: dirty ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s' }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, padding: 60, textAlign: 'center' }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {Object.entries(CONFIG_META).map(([key, meta]) => (
            <div key={key} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '24px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>{meta.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>{key}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{meta.description}</div>
                </div>
                {meta.type === 'boolean' && <div style={{ marginLeft: 20, flexShrink: 0 }}>{renderInput(key, meta)}</div>}
              </div>
              {meta.type !== 'boolean' && renderInput(key, meta)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
