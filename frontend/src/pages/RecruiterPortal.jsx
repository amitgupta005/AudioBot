import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthUser } from "../lib/authStore";
import {
  createJob,
  createInterview,
  downloadConversationReport,
  fetchInterviews,
  fetchRecruiterInterviewConversation,
  fetchRecruiterJobCandidates,
  fetchRecruiterJobs,
  updateCandidate,
} from "../lib/api";
import "./RecruiterPortal.css";

function formatDate(value) {
  if (!value) {
    return "Unknown";
  }
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function RecruiterPortal() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [currentView, setCurrentView] = useState("dashboard"); // "dashboard", "create_job", "candidate_report"
  
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [candidateStage, setCandidateStage] = useState("all");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [jobInterviews, setJobInterviews] = useState([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState("");
  const [selectedInterview, setSelectedInterview] = useState(null);
  
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [approvingCandidate, setApprovingCandidate] = useState(false);
  
  const [createJobForm, setCreateJobForm] = useState({
    title: "",
    description: "",
    companyName: "",
    jdFile: null,
  });
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  const [jdExpanded, setJdExpanded] = useState(true);

  async function loadJobs(options = {}) {
    const { preferredJobId = "" } = options;
    setLoadingJobs(true);
    setError("");
    try {
      const jobRows = await fetchRecruiterJobs();
      setJobs(jobRows);
      if (preferredJobId && jobRows.some((row) => row.id === preferredJobId)) {
        setSelectedJobId(preferredJobId);
      } else if (!selectedJobId && jobRows.length > 0) {
        setSelectedJobId(jobRows[0].id);
      }
    } catch (loadError) {
      setError(loadError.message || "Unable to load recruiter jobs.");
    } finally {
      setLoadingJobs(false);
    }
  }

  useEffect(() => {
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;

    async function loadCandidatesAndInterviews() {
      if (!selectedJobId) {
        setCandidates([]);
        setJobInterviews([]);
        return;
      }

      setLoadingCandidates(true);
      setError("");
      try {
        const [candidateRows, interviewRows] = await Promise.all([
          fetchRecruiterJobCandidates(selectedJobId, candidateStage),
          fetchInterviews(),
        ]);
        if (!active) return;
        setCandidates(candidateRows);
        const filteredInterviews = interviewRows.filter((row) => row.job_id === selectedJobId);
        setJobInterviews(filteredInterviews);
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Unable to load candidates.");
        }
      } finally {
        if (active) {
          setLoadingCandidates(false);
        }
      }
    }

    loadCandidatesAndInterviews();
    return () => {
      active = false;
    };
  }, [candidateStage, selectedJobId]);

  useEffect(() => {
    let active = true;

    async function loadInterviewConversation() {
      if (!selectedInterviewId) {
        setSelectedInterview(null);
        return;
      }

      setLoadingConversation(true);
      setError("");
      try {
        const payload = await fetchRecruiterInterviewConversation(selectedInterviewId);
        if (active) {
          setSelectedInterview(payload);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Unable to load interview conversation.");
        }
      } finally {
        if (active) {
          setLoadingConversation(false);
        }
      }
    }

    loadInterviewConversation();
    return () => {
      active = false;
    };
  }, [selectedInterviewId]);

  function handleSignOut() {
    clearAuthSession();
    navigate("/");
  }

  function updateCreateForm(name, value) {
    setCreateJobForm((current) => ({ ...current, [name]: value }));
  }

  async function handleCreateJob(event) {
    event.preventDefault();
    if (!createJobForm.jdFile) {
      setError("Attach a PDF job description before creating a job.");
      return;
    }

    setCreatingJob(true);
    setError("");
    setStatusMessage("");
    try {
      const createdJob = await createJob({
        title: createJobForm.title,
        description: createJobForm.description,
        companyName: createJobForm.companyName || null,
        jdFile: createJobForm.jdFile,
      });

      setCreateJobForm({
        title: "",
        description: "",
        companyName: "",
        jdFile: null,
      });
      setCurrentView("dashboard");
      await loadJobs({ preferredJobId: createdJob.id });
    } catch (createError) {
      setError(createError.message || "Unable to create a new job.");
    } finally {
      setCreatingJob(false);
    }
  }

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || null;
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedCandidateId) || null;
  const transcriptMessages = (selectedInterview?.conversation || []).filter((msg) => msg.type !== "system");
  const reportData = selectedInterview?.candidate_report || {};
  const scores = reportData?.scores || {};
  const summary = reportData?.summary || "No AI report summary available yet.";
  const overallScore = reportData?.overall_score || 0;

  async function handleDownloadReport() {
    if (!selectedInterviewId) return;
    try {
      const blob = await downloadConversationReport(selectedInterviewId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${selectedInterviewId}-candidate-report.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(downloadError.message || "Unable to download report.");
    }
  }

  async function handleApproveCandidate() {
    if (!selectedCandidate || !selectedJobId) return;

    setApprovingCandidate(true);
    setError("");
    setStatusMessage("");
    try {
      await updateCandidate(selectedCandidate.id, { status: "in_progress" });

      const existingInterview = jobInterviews.find(
        (interview) => interview.candidate_id === selectedCandidate.id,
      );
      let createdInterviewId = existingInterview?.id || "";
      if (!existingInterview) {
        const createdInterview = await createInterview({
          candidate_id: selectedCandidate.id,
          job_id: selectedJobId,
          status: "scheduled",
        });
        createdInterviewId = createdInterview.id;
      }

      // Refresh candidates
      const [candidateRows, interviewRows] = await Promise.all([
        fetchRecruiterJobCandidates(selectedJobId, candidateStage),
        fetchInterviews(),
      ]);
      setCandidates(candidateRows);
      const filteredInterviews = interviewRows.filter((row) => row.job_id === selectedJobId);
      setJobInterviews(filteredInterviews);

      setStatusMessage("Candidate approved and interview scheduled successfully.");
    } catch (approveError) {
      setError(approveError.message || "Unable to approve candidate.");
    } finally {
      setApprovingCandidate(false);
    }
  }

  function openCandidateReport(candidateId) {
    setSelectedCandidateId(candidateId);
    const existingInterview = jobInterviews.find((i) => i.candidate_id === candidateId);
    if (existingInterview) {
      setSelectedInterviewId(existingInterview.id);
    } else {
      setSelectedInterviewId("");
      setSelectedInterview(null);
    }
    setCurrentView("candidate_report");
  }

  function renderScoreBar(label, score) {
    const percentage = score ? score * 10 : 0;
    return (
      <div className="skill-row" key={label}>
        <div className="skill-label">
          <span>{label}</span>
          <span>{percentage}%</span>
        </div>
        <div className="skill-bar-bg">
          <div className="skill-bar-fill" style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="recruiter-portal-container">
      <header className="recruiter-portal-header">
        <div className="portal-brand">
          <h1>AudioBot Recruiter</h1>
          <p>Signed in as {user?.full_name || user?.email || "Recruiter"}.</p>
        </div>
        <div className="portal-header-actions">
          <button onClick={handleSignOut} type="button">Sign out</button>
        </div>
      </header>

      <div className="recruiter-layout">
        {/* Sidebar Navigation */}
        <aside>
          <h3 className="recruiter-sidebar-header">JOBS</h3>
          {loadingJobs ? <p style={{ fontSize: '0.8rem' }}>Loading jobs...</p> : null}
          <div className="job-list">
            {jobs.map((job) => (
              <button
                key={job.id}
                className={`job-list-item ${job.id === selectedJobId && currentView !== 'create_job' ? "active" : ""}`}
                onClick={() => {
                  setSelectedJobId(job.id);
                  setCurrentView("dashboard");
                }}
                type="button"
              >
                <strong>{job.title}</strong>
                <span>{job.company_name || "AudioBot"}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Main View Area */}
        <main className="recruiter-main-view">
          {currentView === "dashboard" && (
            <>
              <div className="view-header">
                <h2>Job Applicants Management View</h2>
                <button className="action-btn" onClick={() => setCurrentView("create_job")}>Create Job</button>
              </div>

              {selectedJob ? (
                <>
                  <div className="r-card job-title-card">
                    <h3>{selectedJob.title}</h3>
                    <div className="jd-box">
                      <div className="jd-box-header" onClick={() => setJdExpanded(!jdExpanded)}>
                        <span>Job Description</span>
                        <span>{jdExpanded ? "˄" : "˅"}</span>
                      </div>
                      {jdExpanded && (
                        <div className="jd-box-content">
                          {selectedJob.description}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="r-card">
                    <div className="tabs-container">
                      <button 
                        className={`tab-btn ${candidateStage === 'all' ? 'active' : ''}`}
                        onClick={() => setCandidateStage('all')}
                      >
                        Candidates
                      </button>
                      <button 
                        className={`tab-btn ${candidateStage === 'applied' ? 'active' : ''}`}
                        onClick={() => setCandidateStage('applied')}
                      >
                        Shortlisted
                      </button>
                      <button 
                        className={`tab-btn ${candidateStage === 'approved' ? 'active' : ''}`}
                        onClick={() => setCandidateStage('approved')}
                      >
                        Approved
                      </button>
                    </div>

                    {loadingCandidates ? (
                      <p style={{ padding: '16px', color: '#64748b' }}>Loading candidates...</p>
                    ) : (
                      <table className="candidate-table">
                        <thead>
                          <tr>
                            <th>Candidate ID / Name</th>
                            <th>Application Date</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {candidates.length === 0 ? (
                            <tr>
                              <td colSpan="3" style={{ textAlign: 'center' }}>No candidates found in this stage.</td>
                            </tr>
                          ) : (
                            candidates.map(candidate => {
                              const interviewObj = jobInterviews.find(i => i.candidate_id === candidate.id);
                              let statusDisplay = candidate.status;
                              if (interviewObj?.status === 'completed') statusDisplay = "Interview Completed";
                              else if (candidate.status === 'applied') statusDisplay = "Application Received";
                              else if (candidate.status === 'in_progress') statusDisplay = "Pending Review";

                              return (
                                <tr key={candidate.id} onClick={() => openCandidateReport(candidate.id)}>
                                  <td>
                                    {candidate.id.split('-')[0].toUpperCase()}... 
                                    {candidate.user?.full_name ? ` (${candidate.user.full_name})` : " (Unknown Name)"}
                                  </td>
                                  <td>{formatDate(candidate.created_at)}</td>
                                  <td>{statusDisplay}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              ) : (
                <div className="r-card">
                  <p>Select a job from the sidebar to view applicants.</p>
                </div>
              )}
            </>
          )}

          {currentView === "candidate_report" && (
            <>
              <div className="view-header">
                <h2>Candidate Interview Report & Transcript</h2>
                <div>
                  <button className="btn-secondary" onClick={() => setCurrentView("dashboard")} style={{ marginRight: '16px' }}>Back to Job</button>
                  {selectedInterview?.candidate_report_pdf && (
                    <button className="action-btn" onClick={handleDownloadReport}>Download Interview Report</button>
                  )}
                  {selectedCandidate?.status === "applied" && (
                     <button 
                       className="action-btn" 
                       onClick={handleApproveCandidate} 
                       disabled={approvingCandidate}
                       style={{ marginLeft: '16px', background: '#22c55e' }}
                     >
                       {approvingCandidate ? "Approving..." : "Approve Candidate"}
                     </button>
                  )}
                </div>
              </div>

              <div className="r-card">
                <div className="report-header">
                  <div className="report-meta">
                    <span><strong>Candidate:</strong> {selectedCandidate?.user?.full_name || "Unknown"}</span>
                    <span><strong>Position:</strong> {selectedJob?.title || "Unknown"}</span>
                    <span><strong>Date:</strong> {formatDate(selectedInterview?.created_at || selectedCandidate?.created_at)}</span>
                  </div>
                  <div className="score-badge">
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>Overall Score</span>
                    <div className="score-number">{overallScore ? `${overallScore * 10}/100` : "N/A"}</div>
                    {overallScore > 0 && (
                      <div className="score-bar-container">
                        <div className="score-bar-fill" style={{ width: `${overallScore * 10}%` }}></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="report-grid">
                  <div className="report-left">
                    <div className="r-card" style={{ padding: '20px', boxShadow: 'none', background: '#f8fafc' }}>
                      <h4 className="report-title">AI Report Summary</h4>
                      <p className="report-summary-text">{summary}</p>
                    </div>

                    <div className="r-card" style={{ padding: '20px', boxShadow: 'none', background: '#f8fafc' }}>
                      <h4 className="report-title">Skill Ratings</h4>
                      {scores.technical_skills !== undefined ? (
                        <>
                          {renderScoreBar("Technical Knowledge", scores.technical_skills)}
                          {renderScoreBar("Communication", scores.communication)}
                          {renderScoreBar("Problem Solving", scores.problem_solving)}
                          {renderScoreBar("Culture Fit", scores.role_fit)}
                        </>
                      ) : (
                        <p style={{ fontSize: '0.9rem', color: '#64748b' }}>No detailed ratings available.</p>
                      )}
                    </div>
                  </div>

                  <div className="report-right">
                    <div className="r-card" style={{ padding: '20px', boxShadow: 'none', background: '#f8fafc', height: '100%' }}>
                      <h4 className="report-title">Interview Transcript</h4>
                      {loadingConversation ? (
                        <p>Loading conversation...</p>
                      ) : transcriptMessages.length > 0 ? (
                        <div className="transcript-container">
                          {transcriptMessages.map((msg, i) => (
                            <div key={i} className={`chat-bubble ${msg.type === "human" ? "candidate" : "ai"}`}>
                              <span>{msg.type === "human" ? "Candidate" : "AI"}</span>
                              {msg.data?.content || ""}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: '#64748b' }}>No transcript available for this candidate.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {error && <p style={{ color: 'red', marginTop: '16px' }}>{error}</p>}
              {statusMessage && <p style={{ color: 'green', marginTop: '16px' }}>{statusMessage}</p>}
            </>
          )}

          {currentView === "create_job" && (
            <>
              <div className="view-header" style={{ marginBottom: '24px' }}>
                <h2>Create New Job</h2>
                <button className="btn-secondary" onClick={() => setCurrentView("dashboard")}>Cancel</button>
              </div>

              <div className="r-card" style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
                <form className="create-job-form" onSubmit={handleCreateJob}>
                  <label>
                    Job Title
                    <input
                      required
                      type="text"
                      placeholder="e.g., Senior Software Engineer"
                      value={createJobForm.title}
                      onChange={(e) => updateCreateForm("title", e.target.value)}
                    />
                  </label>

                  <label>
                    Company / Department
                    <input
                      type="text"
                      placeholder="e.g., Noventra Engineering"
                      value={createJobForm.companyName}
                      onChange={(e) => updateCreateForm("companyName", e.target.value)}
                    />
                  </label>

                  <label>
                    Job Description
                    <textarea
                      required
                      rows={6}
                      placeholder="Describe the role, responsibilities, and requirements..."
                      value={createJobForm.description}
                      onChange={(e) => updateCreateForm("description", e.target.value)}
                    />
                  </label>

                  <label>
                    Reference Job Description PDF
                    <input
                      required
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => updateCreateForm("jdFile", e.target.files?.[0] || null)}
                      style={{ marginTop: '8px' }}
                    />
                  </label>

                  {error && <p style={{ color: 'red', marginBottom: '16px' }}>{error}</p>}

                  <div className="create-actions">
                    <button type="button" className="btn-secondary" onClick={() => setCurrentView("dashboard")}>Cancel</button>
                    <button type="submit" className="action-btn" disabled={creatingJob}>
                      {creatingJob ? "Creating..." : "Save and Create Job"}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

        </main>
      </div>
    </div>
  );
}
