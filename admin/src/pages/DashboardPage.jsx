import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import api from '../services/api';

const StatCard = ({ label, value, sub, color = 'var(--accent)', icon }) => (
  <div style={c.statCard}>
    <div style={c.statIcon}>{icon}</div>
    <div style={{ ...c.statValue, color }}>{value ?? '—'}</div>
    <div style={c.statLabel}>{label}</div>
    {sub && <div style={c.statSub}>{sub}</div>}
  </div>
);

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => api.get('/admin/stats').then(({ data }) => { setStats(data.stats); setLoading(false); });
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  if (loading) return <div style={c.loading}><span style={c.spinner} />Loading…</div>;

  const { users, conversations, sessions, activityChart } = stats;

  return (
    <div style={c.page} className="fade-in">
      <div style={c.pageHeader}>
        <h1 style={c.pageTitle}>Dashboard</h1>
        <span style={c.refreshHint}>Auto-refreshes every 30s</span>
      </div>

      {/* Stat grid */}
      <div style={c.grid}>
        <StatCard icon="👥" label="Total Users" value={users.total} sub={`+${users.newThisWeek} this week`} color="var(--accent)" />
        <StatCard icon="✅" label="Active Users" value={users.active} color="var(--green)" />
        <StatCard icon="🚫" label="Banned Users" value={users.banned} color="var(--red)" />
        <StatCard icon="💬" label="Conversations" value={conversations.total} sub={`${conversations.active} active`} color="var(--yellow)" />
        <StatCard icon="🔌" label="Live Sessions" value={sessions.active} sub={`${sessions.total} total in Redis`} color="var(--accent)" />
        <StatCard icon="📨" label="Total Messages" value={conversations.totalMessages} color="var(--text)" />
      </div>

      {/* Redis stats */}
      <div style={c.section}>
        <h2 style={c.sectionTitle}>Redis Session Store</h2>
        <div style={c.redisCard}>
          <div style={c.redisStat}>
            <span style={c.redisVal}>{sessions.active}</span>
            <span style={c.redisLbl}>Active Sessions</span>
          </div>
          <div style={c.redisDivider} />
          <div style={c.redisStat}>
            <span style={c.redisVal}>{sessions.ended}</span>
            <span style={c.redisLbl}>Ended (in TTL)</span>
          </div>
          <div style={c.redisDivider} />
          <div style={c.redisStat}>
            <span style={c.redisVal}>{stats.redis?.dbSize}</span>
            <span style={c.redisLbl}>Total Redis Keys</span>
          </div>
        </div>
      </div>

      {/* Activity chart */}
      {activityChart?.length > 0 && (
        <div style={c.section}>
          <h2 style={c.sectionTitle}>Conversations — Last 7 Days</h2>
          <div style={c.chartBox}>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={activityChart}>
                <defs>
                  <linearGradient id="cGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="_id" stroke="var(--text-muted)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="count" stroke="var(--accent)" fill="url(#cGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

const c = {
  page: { padding: '2rem', maxWidth: 1200 },
  pageHeader: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '1.75rem' },
  pageTitle: { fontSize: 22, fontWeight: 600 },
  refreshHint: { fontSize: 11, color: 'var(--text-muted)' },
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-muted)' },
  spinner: { width: 18, height: 18, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: '2rem' },
  statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.25rem', },
  statIcon: { fontSize: 22, marginBottom: 8 },
  statValue: { fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', lineHeight: 1 },
  statLabel: { fontSize: 12, color: 'var(--text-muted)', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  statSub: { fontSize: 11, color: 'var(--green)', marginTop: 3 },
  section: { marginBottom: '2rem' },
  sectionTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: '1rem' },
  redisCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem', display: 'flex', gap: 0 },
  redisStat: { flex: 1, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 },
  redisVal: { fontSize: 32, fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: 700 },
  redisLbl: { fontSize: 12, color: 'var(--text-muted)' },
  redisDivider: { width: 1, background: 'var(--border)', margin: '0 1.5rem' },
  chartBox: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1.5rem' },
};
