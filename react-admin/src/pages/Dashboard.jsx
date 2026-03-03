import { useEffect, useState } from 'react';
import { adminApi } from '../services/api';

const StatCard = ({ label, value, sub, color = '#3b6cf4', icon }) => (
  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '24px', flex: 1, minWidth: 200 }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}>{label}</div>
      <div style={{ fontSize: 20 }}>{icon}</div>
    </div>
    <div style={{ fontSize: 38, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>{value ?? '—'}</div>
    {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{sub}</div>}
  </div>
);

const StatusBadge = ({ connected }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontFamily: "'DM Mono', monospace", background: connected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${connected ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`, color: connected ? '#4ade80' : '#f87171' }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
    {connected ? 'connected' : 'disconnected'}
  </span>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data } = await adminApi.getStats();
      setStats(data.stats);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  return (
    <div className="page">
      <div className="page-title">Dashboard</div>
      <div className="page-sub">Real-time overview — auto-refreshes every 15s</div>

      {loading ? <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Loading...</div> : (
        <>
          {/* User stats */}
          <div style={{ marginBottom: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}>Users</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
            <StatCard icon="◉" label="Total Users" value={stats?.users?.total} sub={`+${stats?.users?.newToday || 0} today`} />
            <StatCard icon="●" label="Active" value={stats?.users?.active} color="#22c55e" />
            <StatCard icon="⊘" label="Banned" value={stats?.users?.banned} color="#ef4444" />
            <StatCard icon="⬡" label="Admins" value={stats?.users?.admins} color="#f59e0b" />
          </div>

          {/* Conversations */}
          <div style={{ marginBottom: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}>Conversations</div>
          <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
            <StatCard icon="◈" label="Total" value={stats?.conversations?.total} />
            <StatCard icon="◈" label="Active Now" value={stats?.conversations?.active} sub="in progress" color="#22c55e" />
            <StatCard icon="◈" label="Today" value={stats?.conversations?.today} sub="started today" />
          </div>

          {/* Infrastructure */}
          <div style={{ marginBottom: 12, fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace" }}>Infrastructure</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>Redis</div>
              <StatusBadge connected={stats?.sessions?.redisConnected} />
              <div style={{ marginTop: 16, fontSize: 32, fontWeight: 700, color: '#f1f5f9' }}>{stats?.sessions?.activeSessions ?? 0}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>active sessions</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>{stats?.sessions?.totalRedisKeys ?? 0} total keys</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 24, flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", marginBottom: 16 }}>MongoDB</div>
              <StatusBadge connected={true} />
              <div style={{ marginTop: 16, fontSize: 32, fontWeight: 700, color: '#f1f5f9' }}>{stats?.conversations?.total ?? 0}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>stored conversations</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
