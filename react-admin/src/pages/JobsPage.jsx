import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, companyApi } from '../services/api';
import useAdminStore from '../store/adminStore';

function JobRow({ job, onSelect, onUpload }) {
  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <td style={{ padding: '14px 20px' }}>{job.title}</td>
      <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{job._id}</td>
      <td style={{ padding: '14px 20px', fontSize: 13, color: 'rgba(255,255,255,0.5)', fontFamily: "'DM Mono', monospace" }}>{new Date(job.createdAt).toLocaleString()}</td>
      <td style={{ padding: '14px 20px' }}>
        <button onClick={() => onSelect(job)} style={{ padding: '6px 12px', marginRight: 8, borderRadius: 6, border: '1px solid rgba(59,108,244,0.4)', background: 'rgba(59,108,244,0.1)', color: '#7c9ae0', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          View Conversations
        </button>
        <button onClick={() => onUpload(job)} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.1)', color: '#86efac', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
          Upload JD
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

function ConversationAccordion({ conversation, onViewDetails }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          background: isExpanded ? 'rgba(59,108,244,0.15)' : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isExpanded ? 'rgba(59,108,244,0.3)' : 'rgba(255,255,255,0.08)'}`,
          borderRadius: 10,
          padding: '12px 14px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          transition: 'all 0.2s ease',
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 20,
              height: 20,
              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s ease',
              color: '#7c9ae0',
              fontSize: 12,
            }}>
            ▼
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
              {conversation.userId?.name || 'Unknown Candidate'}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
              {conversation.messageCount} messages · {new Date(conversation.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              paddingLeft: 8,
              borderLeft: '1px solid rgba(255,255,255,0.1)',
            }}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: conversation.isActive ? '#4ade80' : 'rgba(255,255,255,0.2)',
              }}></div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {conversation.isActive ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div
          style={{
            background: 'rgba(59,108,244,0.08)',
            border: '1px solid rgba(59,108,244,0.2)',
            borderTop: 'none',
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            padding: '12px 14px',
            marginBottom: 4,
            animation: 'slideDown 0.2s ease',
          }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Email
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', fontFamily: "'DM Mono', monospace" }}>
                {conversation.userId?.email || 'N/A'}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Session ID
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontFamily: "'DM Mono', monospace", wordBreak: 'break-all' }}>
                {conversation.sessionId}
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => onViewDetails(conversation)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid rgba(59,108,244,0.4)',
                background: 'rgba(59,108,244,0.15)',
                color: '#7c9ae0',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'inherit',
                fontWeight: 500,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(59,108,244,0.25)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(59,108,244,0.15)';
              }}>
              View Full Conversation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConversationModal({ conversation, onClose, apiSource }) {
  const [convo, setConvo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (conversation?.sessionId) {
      apiSource.getConversation(conversation.sessionId)
        .then(({ data }) => {
          setConvo(data.conversation);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [conversation, apiSource]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}>
      <div
        style={{
          background: '#0f1420',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 16,
          padding: 32,
          width: 700,
          maxHeight: '85vh',
          overflow: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 24,
          }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
              {convo?.title || 'Conversation'}
            </div>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(255,255,255,0.3)',
                fontFamily: "'DM Mono', monospace",
              }}>
              {convo?.userId?.email} · {convo?.messageCount} messages
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              fontSize: 20,
            }}>
            ×
          </button>
        </div>
        {loading ? (
          <div
            style={{
              color: 'rgba(255,255,255,0.3)',
              textAlign: 'center',
              padding: 40,
            }}>
            Loading...
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {convo?.messages?.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  flexDirection: m.role === 'user' ? 'row-reverse' : 'row',
                }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background:
                      m.role === 'assistant'
                        ? 'linear-gradient(135deg, #3b6cf4, #7c9ae0)'
                        : 'rgba(255,255,255,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    flexShrink: 0,
                  }}>
                  {m.role === 'assistant' ? '🤖' : '👤'}
                </div>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 12,
                    fontSize: 13,
                    lineHeight: 1.6,
                    background:
                      m.role === 'assistant'
                        ? 'rgba(255,255,255,0.05)'
                        : 'rgba(59,108,244,0.15)',
                    border: `1px solid ${
                      m.role === 'assistant'
                        ? 'rgba(255,255,255,0.07)'
                        : 'rgba(59,108,244,0.25)'
                    }`,
                    maxWidth: '80%',
                  }}>
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
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
  const [uploadingJob, setUploadingJob] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const fileInputRef = useRef(null);

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const { data } = await (user.role === 'company' ? companyApi.getJobs() : adminApi.getJobs());
      const fetchedJobs = data.jobs || [];
      setJobs(fetchedJobs);

      // If no job selected yet, auto-select first job and load conversations.
      if (fetchedJobs.length > 0 && !selectedJob) {
        setSelectedJob(fetchedJobs[0]);
      }
    } catch (e) {
      console.error('Failed to load jobs:', e);
      toast.error(e.response?.data?.message || 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  const fetchConversations = async (jobId, page = 1) => {
    if (!jobId) {
      setConvos([]);
      setConvTotal(0);
      setConvPage(1);
      return;
    }

    setConvLoading(true);
    try {
      const { data } = await (user.role === 'company' ? companyApi.getJobConversations(jobId, { page }) : adminApi.getJobConversations(jobId, { page }));
      setConvos(data.conversations || []);
      setConvTotal(data.total || 0);
      setConvPage(data.page || 1);
    } catch (e) {
      console.error('Failed to load conversations:', e);
      toast.error(e.response?.data?.message || 'Failed to load conversations');
    } finally {
      setConvLoading(false);
    }
  };

  useEffect(() => { fetchJobs(); }, []);

  const handleJDUpload = async (job, file) => {
    if (!file) return;
    setUploading(true);
    try {
      const apiSource = user.role === 'company' ? companyApi : adminApi;
      await apiSource.uploadJD(file, job._id);
      toast.success('JD uploaded successfully; job context recorded in the system.');
      setUploadingJob(null);
      setSelectedJob(job);
      // no need to refetch jobs, end user flow continues as conversation is linked by jobId
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to upload JD');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (selectedJob) fetchConversations(selectedJob._id, 1);
  }, [selectedJob]);

  return (
    <div className="page">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !uploadingJob) return;
          handleJDUpload(uploadingJob, file);
          e.target.value = null;
        }}
      />
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
      {uploading && <div style={{ marginTop: 10, color: '#7c9ae0', fontSize: 13 }}>Uploading JD for {uploadingJob?.title || 'job'}... please wait.</div>}

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
                  <JobRow
                    key={job._id}
                    job={job}
                    onSelect={(j) => {
                      setSelectedJob(j);
                      setConvos([]);
                      setConvTotal(0);
                      setConvPage(1);
                    }}
                    onUpload={(j) => {
                      setUploadingJob(j);
                      fileInputRef.current?.click();
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 360 }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedJob ? selectedJob.title : 'Select a job'}</div>
              {selectedJob && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Job ID: {selectedJob._id}</div>}
            </div>
            
            {selectedJob ? (
              <>
                {/* Job Description */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: "'DM Mono', monospace", marginBottom: 8 }}>Description</div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 8, padding: 16, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>
                    {selectedJob.description || 'No description provided.'}
                  </div>
                </div>

                {/* Conversations Section */}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 20 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Conversations</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 14 }}>{convTotal} conversation{convTotal === 1 ? '' : 's'}</div>
                  <div style={{ maxHeight: 420, overflow: 'auto', paddingRight: 6 }}>
                    {convLoading ? (
                      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Loading...</div>
                    ) : convos.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>No conversations yet.</div>
                    ) : (
                      <div>
                        {convos.map((c) => (
                          <ConversationAccordion
                            key={c.sessionId}
                            conversation={c}
                            onViewDetails={setSelectedConvo}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  {convTotal > 20 && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                      {[...Array(Math.ceil(convTotal / 20))].map((_, i) => (
                        <button key={i} onClick={() => fetchConversations(selectedJob._id, i + 1)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${convPage === i + 1 ? 'rgba(59,108,244,0.5)' : 'rgba(255,255,255,0.08)'}`, background: convPage === i + 1 ? 'rgba(59,108,244,0.15)' : 'transparent', color: convPage === i + 1 ? '#7c9ae0' : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit' }}>{i + 1}</button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)' }}>Select a job to see its details and conversations.</div>
            )}
          </div>
        </div>
      </div>

      {selectedConvo && (
        <ConversationModal
          conversation={selectedConvo}
          onClose={() => setSelectedConvo(null)}
          apiSource={user.role === 'company' ? companyApi : adminApi}
        />
      )}
    </div>
  );
}
