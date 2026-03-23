import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, companyApi } from '../services/api';
import useAdminStore from '../store/adminStore';

function JobRow({ job, onSelect }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <td style={{ padding: '14px 20px' }}>{job.title}</td>
      <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{job._id}</td>
      <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{new Date(job.createdAt).toLocaleString()}</td>
      <td style={{ padding: '14px 20px' }}>
        <button onClick={() => onSelect(job)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(59,108,244,0.4)', background: 'rgba(59,108,244,0.1)', color: '#7c9ae0', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          View Conversations
        </button>
      </td>
    </tr>
  );
}

function CreateJobModal({ onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !description.trim()) return toast.error('Title + description required');
    setLoading(true);
    try {
      await companyApi.createJob({ title, description });
      toast.success('Job created');
      onCreated();
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to create job');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#0f1420', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 32, width: 520 }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Create new job</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>Candidates will sign up using the Job ID shown below.</div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior Frontend Developer" style={{ width: '100%', padding: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the role and what you'd like candidates to know..." style={{ width: '100%', minHeight: 100, padding: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleCreate} disabled={loading} style={{ flex: 1, padding: '10px', background: 'rgba(59,108,244,0.2)', border: '1px solid rgba(59,108,244,0.3)', borderRadius: 8, color: '#7c9ae0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            {loading ? 'Creating...' : 'Create Job'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const { user } = useAdminStore();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [convos, setConvos] = useState([]);
  const [convPage, setConvPage] = useState(1);
  const [convTotal, setConvTotal] = useState(0);
  const [convLoading, setConvLoading] = useState(false);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data } = await (user.role === 'company' ? companyApi.getJobs() : adminApi.getJobs());
      setJobs(data.jobs || []);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async (jobId, page = 1) => {
    setConvLoading(true);
    try {
      const { data } = await (user.role === 'company' ? companyApi.getJobConversations(jobId, { page }) : adminApi.getJobConversations(jobId, { page }));
      setConvos(data.conversations || []);
      setConvTotal(data.total || 0);
      setConvPage(data.page || 1);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to load conversations');
    } finally {
      setConvLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  useEffect(() => {
    if (selectedJob) fetchConversations(selectedJob._id, 1);
  }, [selectedJob]);

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <div className="page-title">Jobs</div>
          <div className="page-sub">{user.role === 'company' ? 'Manage your job postings and candidate conversations.' : 'View jobs and conversations across companies.'}</div>
        </div>
        {user.role === 'company' && (
          <button onClick={() => setShowCreate(true)} style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(59,108,244,0.4)', background: 'rgba(59,108,244,0.15)', color: '#7c9ae0', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
            + Create Job
          </button>
        )}
      </div>

      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} onCreated={fetchJobs} />}

      <div style={{ display: 'flex', gap: 18, marginTop: 28 }}>
        <div style={{ flex: 1, minWidth: 320 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['Title', 'Job ID', 'Created', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '14px 20px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>Loading...</td></tr>
                ) : jobs.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>No jobs found.</td></tr>
                ) : jobs.map((job) => (
                  <JobRow key={job._id} job={job} onSelect={setSelectedJob} />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 360 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedJob ? `Conversations for: ${selectedJob.title}` : 'Select a job to view conversations'}</div>
              {selectedJob && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Job ID: {selectedJob._id}</div>}
            </div>
            {selectedJob ? (
              <>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>{convTotal} conversation{convTotal === 1 ? '' : 's'}</div>
                <div style={{ maxHeight: 400, overflow: 'auto' }}>
                  {convLoading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Loading...</div>
                  ) : convos.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No conversations yet.</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                          {['Candidate', 'Started', 'Messages', 'Active'].map((h) => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", fontWeight: 400 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {convos.map((c) => (
                          <tr key={c.sessionId} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{c.userId?.name || 'Unknown'}</td>
                            <td style={{ padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{new Date(c.createdAt).toLocaleString()}</td>
                            <td style={{ padding: '10px 12px', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{c.messageCount}</td>
                            <td style={{ padding: '10px 12px', fontSize: 13, color: c.isActive ? '#4ade80' : 'rgba(255,255,255,0.35)' }}>{c.isActive ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                {convTotal > 20 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                    {[...Array(Math.ceil(convTotal / 20))].map((_, i) => (
                      <button key={i} onClick={() => fetchConversations(selectedJob._id, i + 1)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${convPage === i + 1 ? 'rgba(59,108,244,0.5)' : 'rgba(255,255,255,0.08)'}`, background: convPage === i + 1 ? 'rgba(59,108,244,0.15)' : 'transparent', color: convPage === i + 1 ? '#7c9ae0' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>{i + 1}</button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Select a job to see its candidate conversations.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
