import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthUser } from "../lib/authStore";
import { applyToJob, fetchCandidates, fetchInterviews, fetchJobs } from "../lib/api";
import "./UploadPage.css";

function formatFileSize(size = 0) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

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

export default function UploadPage() {
  const navigate = useNavigate();
  const user = getAuthUser();
  const [jobs, setJobs] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [resumeFile, setResumeFile] = useState(null);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) || null,
    [jobs, selectedJobId],
  );

  useEffect(() => {
    let active = true;

    async function loadPortalData() {
      setLoadingJobs(true);
      setError("");

      try {
        const [jobsResponse, interviewsResponse] = await Promise.all([
          fetchJobs(),
          fetchInterviews().catch(() => []),
        ]);

        if (!active) {
          return;
        }

        setJobs(jobsResponse);
        setSelectedJobId(jobsResponse[0]?.id || "");
        setInterviews(interviewsResponse);
      } catch (loadError) {
        if (active) {
          setError(loadError.message || "Unable to load candidate portal data.");
        }
      } finally {
        if (active) {
          setLoadingJobs(false);
        }
      }
    }

    loadPortalData();
    return () => {
      active = false;
    };
  }, []);

  const interviewByJob = useMemo(
    () => interviews.filter((interview) => interview.job_id === selectedJobId),
    [interviews, selectedJobId],
  );

  async function handleApply(event) {
    event.preventDefault();
    if (!selectedJobId) {
      setError("Select a job before applying.");
      return;
    }
    if (!resumeFile) {
      setError("Upload your resume PDF before applying.");
      return;
    }

    setSubmitting(true);
    setError("");
    setStatus("Submitting application...");
    try {
      const candidate = await applyToJob(selectedJobId, resumeFile);
      setStatus("Application submitted. Checking interview availability...");

      const [nextInterviews, candidateRows] = await Promise.all([
        fetchInterviews().catch(() => []),
        fetchCandidates().catch(() => []),
      ]);
      setInterviews(nextInterviews);

      const matchingInterview = nextInterviews.find(
        (row) => row.job_id === selectedJobId && row.candidate_id === candidate.id,
      );

      if (matchingInterview) {
        navigate(`/chat/${matchingInterview.id}`);
        return;
      }

      const latestCandidate = candidateRows.find((row) => row.id === candidate.id) || candidate;
      setStatus(
        `Application recorded (${latestCandidate.status}). A recruiter will schedule your interview soon.`,
      );
      setResumeFile(null);
    } catch (applyError) {
      setError(applyError.message || "Unable to apply for this job.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleJoinInterview(interviewId) {
    navigate(`/chat/${interviewId}`);
  }

  function handleSignOut() {
    clearAuthSession();
    navigate("/");
  }

  return (
    <div className="upload-page-container">
      <header className="upload-page-header">
        <div className="upload-brand-container">
          <div className="upload-brand">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#8b5cf6" }}>
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="22"></line>
            </svg>
            AudioBot <span>Candidate</span>
          </div>
          <div className="upload-divider"></div>
          <div className="upload-user-info">
            Signed in as <strong>{user?.full_name || user?.email || "Candidate"}</strong>
          </div>
        </div>
        <div style={{ display: "flex", gap: "12px" }}>
          {(user?.role === "recruiter" || user?.role === "admin") && (
            <button className="upload-signout-btn" onClick={() => navigate("/recruiter")} type="button">
              Recruiter View
            </button>
          )}
          <button className="upload-signout-btn" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
      </header>

      <main className="upload-main-content">
        <div className="upload-left-col">
          <h1>Master Your<br />Next Interview</h1>
          
          <div className="upload-practice-card">
            <div className="upload-practice-content">
              <div className="upload-practice-icon">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M32 16C24 16 18 22 18 30C18 34.4 20.8 38 24 39.5V44C24 46.2 25.8 48 28 48H36C38.2 48 40 46.2 40 44V39.5C43.2 38 46 34.4 46 30C46 22 40 16 32 16Z" stroke="url(#paint0_linear)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M32 20V44" stroke="url(#paint0_linear)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M24 28H40" stroke="url(#paint0_linear)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M24 36H40" stroke="url(#paint0_linear)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <defs>
                    <linearGradient id="paint0_linear" x1="18" y1="16" x2="46" y2="48" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#a78bfa" />
                      <stop offset="1" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="upload-practice-text">
                <h3>Practice Mock Interview</h3>
                <p>Upload your own JD and resume to practice in technical, behavioral, or HR rounds.</p>
              </div>
            </div>
            <button className="upload-practice-btn" onClick={() => navigate("/mock-interview")} type="button">
              Start Practice →
            </button>
          </div>
        </div>

        <div className="upload-right-col">
          <div className="upload-glass-panel">
            <h2>Apply for Job</h2>
            
            <form className="upload-form-card" onSubmit={handleApply}>
              <h4 className="upload-form-title">Job Application</h4>
              
              <div className="upload-form-group">
                <label className="upload-form-label">Select Job</label>
                <select
                  className="upload-select"
                  disabled={loadingJobs || submitting}
                  onChange={(event) => setSelectedJobId(event.target.value)}
                  value={selectedJobId}
                >
                  {!jobs.length ? <option value="">No jobs available</option> : null}
                  {jobs.map((job) => (
                    <option key={job.id} value={job.id}>
                      {job.title} ({job.company_name || "Company"})
                    </option>
                  ))}
                </select>
              </div>

              <div className="upload-form-group">
                <label className="upload-form-label">Resume (PDF)</label>
                <label className={`upload-dropzone ${resumeFile ? "has-file" : ""}`}>
                  <input
                    accept="application/pdf"
                    onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
                    type="file"
                  />
                  <div className="upload-dropzone-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                      <line x1="16" y1="13" x2="8" y2="13"></line>
                      <line x1="16" y1="17" x2="8" y2="17"></line>
                      <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                  </div>
                  {resumeFile ? (
                    <p className="upload-dropzone-text">
                      <strong>{resumeFile.name}</strong> ({formatFileSize(resumeFile.size)})
                    </p>
                  ) : (
                    <p className="upload-dropzone-text">
                      Drag and drop your resume here, or <span>browse</span>
                    </p>
                  )}
                </label>
              </div>

              <button
                className="upload-submit-btn"
                disabled={submitting || loadingJobs || !selectedJobId}
                type="submit"
              >
                {submitting ? status || "Submitting..." : "Submit Application"}
              </button>

              {loadingJobs ? <p style={{ fontSize: "0.85rem", color: "#5c6c84", marginTop: "12px", textAlign: "center" }}>Loading jobs...</p> : null}
              {!error && status && !submitting ? <p style={{ fontSize: "0.85rem", color: "#10b981", marginTop: "12px", textAlign: "center" }}>{status}</p> : null}
              {error ? <p style={{ fontSize: "0.85rem", color: "#ef4444", marginTop: "12px", textAlign: "center" }}>{error}</p> : null}
            </form>

            {interviewByJob.length > 0 && (
              <div className="upload-scheduled-interviews">
                <h3>Scheduled Interviews</h3>
                {interviewByJob.map((interview) => (
                  <div
                    key={interview.id}
                    className="upload-session-item"
                    onClick={() => handleJoinInterview(interview.id)}
                  >
                    <div className="upload-session-item-info">
                      <strong>Interview #{interview.id.slice(0, 6)}</strong>
                      <small>{interview.status} • {formatDate(interview.created_at)}</small>
                    </div>
                    <span className="upload-session-item-action">Join →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
