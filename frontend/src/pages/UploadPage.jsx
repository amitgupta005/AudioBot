import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearAuthSession, getAuthUser } from "../lib/authStore";
import { applyToJob, fetchCandidates, fetchInterviews, fetchJobs } from "../lib/api";

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
    <main className="page-shell">
      <header className="candidate-header">
        <div>
          <p className="brand-mark">AudioBot Candidate</p>
          <span className="brand-subtitle">
            Signed in as {user?.full_name || user?.email || "candidate"}
          </span>
        </div>
        <div className="candidate-header-actions">
          {(user?.role === "recruiter" || user?.role === "admin") ? (
            <button className="secondary-button" onClick={() => navigate("/recruiter")} type="button">
              Recruiter View
            </button>
          ) : null}
          <button className="ghost-button" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy candidate-workspace-copy">
          <p className="eyebrow">Candidate Portal</p>
          <h1>Apply to a job and join your scheduled interview from one place.</h1>
          <p className="hero-text">
            Choose an active job, upload your resume, and submit your application.
            Once a recruiter schedules your interview, you can open it directly.
          </p>

          <div className="recruiter-report-card">
            <strong>Scheduled Interviews</strong>
            {!interviewByJob.length ? (
              <p>No interviews found for the selected job yet.</p>
            ) : (
              <div className="recruiter-session-list" style={{ maxHeight: "320px", overflowY: "auto", paddingRight: "6px" }}>
                {interviewByJob.map((interview) => (
                  <button
                    key={interview.id}
                    className="session-list-item"
                    onClick={() => handleJoinInterview(interview.id)}
                    type="button"
                  >
                    <span>{interview.id}</span>
                    <small>
                      {interview.status} • created {formatDate(interview.created_at)}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <form className="upload-card candidate-upload-card" onSubmit={handleApply}>
          <div className="candidate-upload-header">
            <div>
              <p className="eyebrow">Job Application</p>
              <h2>Submit your resume for the selected job.</h2>
            </div>
          </div>

          <label className="upload-field candidate-upload-field">
            <span>Select Job</span>
            <select
              className="auth-field"
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
          </label>

          {selectedJob ? (
            <div className="recruiter-report-card">
              <strong>{selectedJob.title}</strong>
              <p>{selectedJob.description}</p>
            </div>
          ) : null}

          <label className="upload-field candidate-upload-field">
            <span>Resume (PDF)</span>
            <input
              accept="application/pdf"
              onChange={(event) => setResumeFile(event.target.files?.[0] || null)}
              type="file"
            />
            <div className={`file-card candidate-file-card ${resumeFile ? "is-selected" : ""}`}>
              <strong>{resumeFile?.name || "No resume selected yet"}</strong>
              <span>{resumeFile ? formatFileSize(resumeFile.size) : "PDF only"}</span>
            </div>
          </label>

          <button
            className="primary-button candidate-launch-button"
            disabled={submitting || loadingJobs || !selectedJobId}
            type="submit"
          >
            {submitting ? status || "Submitting..." : "Apply For Job"}
          </button>

          {loadingJobs ? <p className="status-copy">Loading jobs...</p> : null}
          {!error && status && !submitting ? <p className="status-copy">{status}</p> : null}
          {error ? <p className="error-copy">{error}</p> : null}
        </form>
      </section>
    </main>
  );
}
