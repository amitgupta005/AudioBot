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
  const [showCreateJobForm, setShowCreateJobForm] = useState(false);
  const [createJobForm, setCreateJobForm] = useState({
    title: "",
    description: "",
    companyName: "",
    jdFile: null,
  });
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  async function loadJobs(options = {}) {
    const { preferredJobId = "" } = options;
    setLoadingJobs(true);
    setError("");
    try {
      const jobRows = await fetchRecruiterJobs();
      setJobs(jobRows);
      if (preferredJobId && jobRows.some((row) => row.id === preferredJobId)) {
        setSelectedJobId(preferredJobId);
      } else if (!selectedJobId) {
        setSelectedJobId(jobRows[0]?.id || "");
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
        setSelectedCandidateId("");
        setJobInterviews([]);
        setSelectedInterviewId("");
        setSelectedInterview(null);
        return;
      }

      setLoadingCandidates(true);
      setError("");
      try {
        const [candidateRows, interviewRows] = await Promise.all([
          fetchRecruiterJobCandidates(selectedJobId, candidateStage),
          fetchInterviews(),
        ]);
        if (!active) {
          return;
        }
        setCandidates(candidateRows);
        setSelectedCandidateId(candidateRows[0]?.id || "");
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

  const filteredInterviews = useMemo(() => {
    if (!selectedCandidateId) {
      return jobInterviews;
    }
    return jobInterviews.filter((row) => row.candidate_id === selectedCandidateId);
  }, [jobInterviews, selectedCandidateId]);

  useEffect(() => {
    if (!filteredInterviews.length) {
      setSelectedInterviewId("");
      return;
    }

    const hasCurrent = filteredInterviews.some((row) => row.id === selectedInterviewId);
    if (!hasCurrent) {
      setSelectedInterviewId(filteredInterviews[0].id);
    }
  }, [filteredInterviews, selectedInterviewId]);

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
      setShowCreateJobForm(false);
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
  const storedTranscript = selectedInterview?.transcript || [];
  const summary = selectedInterview?.candidate_report?.summary || "No candidate report summary available yet.";

  async function handleDownloadReport() {
    if (!selectedInterviewId) {
      return;
    }
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
    if (!selectedCandidate || !selectedJobId) {
      return;
    }

    setApprovingCandidate(true);
    setError("");
    setStatusMessage("");
    try {
      await updateCandidate(selectedCandidate.id, { status: "in_progress" });

      const existingInterview = jobInterviews.find(
        (interview) => interview.job_id === selectedJobId && interview.candidate_id === selectedCandidate.id,
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

      const [candidateRows, interviewRows] = await Promise.all([
        fetchRecruiterJobCandidates(selectedJobId, candidateStage),
        fetchInterviews(),
      ]);
      setCandidates(candidateRows);
      setSelectedCandidateId(candidateRows[0]?.id || "");

      const interviewsForJob = interviewRows.filter((row) => row.job_id === selectedJobId);
      setJobInterviews(interviewsForJob);

      if (createdInterviewId) {
        setSelectedInterviewId(createdInterviewId);
      }

      setStatusMessage("Candidate approved successfully.");
    } catch (approveError) {
      setError(approveError.message || "Unable to approve candidate.");
    } finally {
      setApprovingCandidate(false);
    }
  }

  return (
    <main className="recruiter-shell">
      <header className="recruiter-header">
        <div>
          <p className="brand-mark">AudioBot Recruiter</p>
          <p className="header-note">Signed in as {user?.full_name || user?.email || "Recruiter"}.</p>
        </div>
        <div className="recruiter-actions">
          <button
            className="primary-button"
            onClick={() => setShowCreateJobForm((value) => !value)}
            type="button"
          >
            {showCreateJobForm ? "Cancel Job Form" : "Create New Job"}
          </button>
          <button className="ghost-button" onClick={handleSignOut} type="button">Sign out</button>
        </div>
      </header>

      <section className="recruiter-grid">
        <aside className="recruiter-sidebar">
          <div className="recruiter-panel">
            {showCreateJobForm ? (
              <form className="recruiter-report-card" onSubmit={handleCreateJob}>
                <strong>Create Job</strong>
                <label className="upload-field candidate-upload-field">
                  <span>Title</span>
                  <input
                    className="auth-field"
                    onChange={(event) => updateCreateForm("title", event.target.value)}
                    required
                    type="text"
                    value={createJobForm.title}
                  />
                </label>
                <label className="upload-field candidate-upload-field">
                  <span>Description</span>
                  <textarea
                    className="auth-field"
                    onChange={(event) => updateCreateForm("description", event.target.value)}
                    required
                    rows={4}
                    value={createJobForm.description}
                  />
                </label>
                <label className="upload-field candidate-upload-field">
                  <span>Company Name (Optional)</span>
                  <input
                    className="auth-field"
                    onChange={(event) => updateCreateForm("companyName", event.target.value)}
                    type="text"
                    value={createJobForm.companyName}
                  />
                </label>
                <label className="upload-field candidate-upload-field">
                  <span>Job Description PDF</span>
                  <input
                    accept="application/pdf"
                    onChange={(event) => updateCreateForm("jdFile", event.target.files?.[0] || null)}
                    required
                    type="file"
                  />
                </label>
                <button className="primary-button" disabled={creatingJob} type="submit">
                  {creatingJob ? "Creating..." : "Create Job"}
                </button>
              </form>
            ) : null}

            <p className="panel-label">Jobs</p>
            {loadingJobs ? <p className="status-copy">Loading jobs...</p> : null}
            <div className="recruiter-session-list">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  className={`session-list-item ${job.id === selectedJobId ? "is-active" : ""}`}
                  onClick={() => setSelectedJobId(job.id)}
                  type="button"
                >
                  <span>{job.title}</span>
                  <small>{job.company_name || "Company"}</small>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="recruiter-stage">
          <div className="recruiter-panel recruiter-detail-panel">
            <div className="recruiter-detail-header">
              <div>
                <p className="panel-label">Recruiter Review</p>
                <h2>{selectedJob?.title || "Choose a job"}</h2>
              </div>
            </div>

            {selectedJob ? (
              <div className="recruiter-report-card">
                <strong>Job Description</strong>
                <p>{selectedJob.description}</p>
              </div>
            ) : null}

            <div className="recruiter-report-card">
              <strong>Candidates</strong>
              <div className="recruiter-actions">
                <button className="ghost-button" onClick={() => setCandidateStage("all")} type="button">All</button>
                <button className="ghost-button" onClick={() => setCandidateStage("applied")} type="button">Applied</button>
                <button className="ghost-button" onClick={() => setCandidateStage("approved")} type="button">Approved</button>
                <button
                  className="primary-button"
                  disabled={!selectedCandidate || approvingCandidate || selectedCandidate?.status !== "applied"}
                  onClick={handleApproveCandidate}
                  type="button"
                >
                  {approvingCandidate ? "Approving..." : "Approve Candidate"}
                </button>
              </div>
              {loadingCandidates ? <p className="status-copy">Loading candidates...</p> : null}
              {!loadingCandidates && !candidates.length ? <p>No candidates found for this filter.</p> : null}
              <div className="recruiter-session-list">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    className={`session-list-item ${candidate.id === selectedCandidateId ? "is-active" : ""}`}
                    onClick={() => setSelectedCandidateId(candidate.id)}
                    type="button"
                  >
                    <span>{candidate.id}</span>
                    <small>{candidate.status}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="recruiter-report-card">
              <strong>Interviews</strong>
              {selectedInterview?.candidate_report_pdf ? (
                <button className="primary-button" onClick={handleDownloadReport} type="button">
                  Download Interview Report
                </button>
              ) : null}
              {!filteredInterviews.length ? <p>No interviews found for the selected candidate/job.</p> : null}
              <div className="recruiter-session-list">
                {filteredInterviews.map((interview) => (
                  <button
                    key={interview.id}
                    className={`session-list-item ${interview.id === selectedInterviewId ? "is-active" : ""}`}
                    onClick={() => setSelectedInterviewId(interview.id)}
                    type="button"
                  >
                    <span>{interview.id}</span>
                    <small>{interview.status} • {formatDate(interview.created_at)}</small>
                  </button>
                ))}
              </div>
            </div>

            {loadingConversation ? <p className="status-copy">Loading interview conversation...</p> : null}
            {!loadingConversation && selectedInterview ? (
              <>
                <div className="recruiter-report-card">
                  <strong>Report Summary</strong>
                  <p>{summary}</p>
                </div>

                <div className="recruiter-report-card">
                  <strong>Conversation</strong>
                  {transcriptMessages.length ? (
                    <div className="recruiter-transcript-list">
                      {transcriptMessages.map((message, index) => (
                        <article key={`${message.type}-${index}`} className={`recruiter-transcript-item ${message.type}`}>
                          <span>{message.type === "human" ? "Candidate" : "AudioBot"}</span>
                          <p>{message.data?.content || ""}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>No LangGraph conversation found yet.</p>
                  )}
                </div>

                <div className="recruiter-report-card">
                  <strong>Stored Interview Transcript</strong>
                  {storedTranscript.length ? (
                    <pre className="recruiter-context-text">{JSON.stringify(storedTranscript, null, 2)}</pre>
                  ) : (
                    <p>No transcript persisted in the interview record yet.</p>
                  )}
                </div>
              </>
            ) : null}

            {error ? <p className="error-copy">{error}</p> : null}
            {!error && statusMessage ? <p className="status-copy">{statusMessage}</p> : null}
          </div>
        </section>
      </section>
    </main>
  );
}
